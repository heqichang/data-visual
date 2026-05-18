import os
import warnings
from fastapi import FastAPI, UploadFile, File, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import pandas as pd
import numpy as np
import json
import io
import chardet
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
import uuid
import asyncio

app = FastAPI(title="数据可视化平台 API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

data_store: Dict[str, pd.DataFrame] = {}
filter_store: Dict[str, Dict[str, Any]] = {}
active_connections: Dict[str, List[WebSocket]] = {}


class DatabaseConfig(BaseModel):
    db_type: str
    host: str
    port: str
    database: str
    username: str
    password: str
    query: str


class FilterConfig(BaseModel):
    column: str
    filter_type: str
    value: Any


class ChartRequest(BaseModel):
    dataset_id: str
    chart_type: str
    x_column: Optional[str] = None
    y_column: Optional[str] = None
    category_column: Optional[str] = None
    filters: List[FilterConfig] = []


class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket, dataset_id: str):
        await websocket.accept()
        if dataset_id not in active_connections:
            active_connections[dataset_id] = []
        active_connections[dataset_id].append(websocket)
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket, dataset_id: str):
        if dataset_id in active_connections and websocket in active_connections[dataset_id]:
            active_connections[dataset_id].remove(websocket)
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict, dataset_id: str):
        if dataset_id in active_connections:
            for connection in active_connections[dataset_id]:
                await connection.send_json(message)


manager = ConnectionManager()


def clean_value(value):
    if value is None:
        return None
    if isinstance(value, (list, dict, np.ndarray)):
        return str(value)
    try:
        if pd.isna(value):
            return None
    except:
        pass
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
        try:
            if np.isinf(value):
                return None
        except:
            pass
        return float(value)
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    return value


def df_to_records(df: pd.DataFrame) -> List[Dict]:
    result = []
    for _, row in df.iterrows():
        record = {}
        for col in df.columns:
            record[col] = clean_value(row[col])
        result.append(record)
    return result


def detect_encoding(content: bytes) -> str:
    result = chardet.detect(content)
    return result['encoding'] or 'utf-8'


def infer_column_type(series: pd.Series) -> str:
    if pd.api.types.is_bool_dtype(series):
        return 'boolean'
    if pd.api.types.is_numeric_dtype(series):
        return 'numeric'
    if pd.api.types.is_datetime64_any_dtype(series):
        return 'date'
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            pd.to_datetime(series, errors='raise')
        return 'date'
    except:
        pass
    return 'text'


def get_dataframe_info(df: pd.DataFrame) -> Dict[str, Any]:
    info = {
        'rows': int(len(df)),
        'columns': int(len(df.columns)),
        'column_types': {},
        'null_counts': {},
        'null_rates': {},
        'unique_counts': {},
        'memory_usage': int(df.memory_usage(deep=True).sum())
    }
    
    for col in df.columns:
        col_type = infer_column_type(df[col])
        info['column_types'][col] = col_type
        null_count = int(df[col].isnull().sum())
        info['null_counts'][col] = null_count
        info['null_rates'][col] = float(null_count / len(df)) if len(df) > 0 else 0.0
        try:
            unique_count = int(df[col].nunique())
        except:
            unique_count = int(df[col].astype(str).nunique())
        info['unique_counts'][col] = unique_count
    
    return info


def clean_for_json(obj):
    if isinstance(obj, dict):
        return {k: clean_for_json(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [clean_for_json(item) for item in obj]
    elif isinstance(obj, (np.integer,)):
        return int(obj)
    elif isinstance(obj, (np.floating,)):
        if np.isnan(obj) or np.isinf(obj):
            return None
        return float(obj)
    elif isinstance(obj, np.ndarray):
        return clean_for_json(obj.tolist())
    elif pd.isna(obj):
        return None
    return obj


def apply_filters(df: pd.DataFrame, filters: List[FilterConfig]) -> pd.DataFrame:
    filtered_df = df.copy()
    for f in filters:
        if f.filter_type == 'range' and isinstance(f.value, list) and len(f.value) == 2:
            min_val, max_val = f.value
            filtered_df = filtered_df[(filtered_df[f.column] >= min_val) & (filtered_df[f.column] <= max_val)]
        elif f.filter_type == 'in' and isinstance(f.value, list):
            filtered_df = filtered_df[filtered_df[f.column].astype(str).isin([str(v) for v in f.value])]
        elif f.filter_type == 'date_range' and isinstance(f.value, list) and len(f.value) == 2:
            start_date, end_date = f.value
            filtered_df[f.column] = pd.to_datetime(filtered_df[f.column], errors='coerce')
            filtered_df = filtered_df[(filtered_df[f.column] >= start_date) & (filtered_df[f.column] <= end_date)]
        elif f.filter_type == 'equals':
            filtered_df = filtered_df[filtered_df[f.column].astype(str) == str(f.value)]
    return filtered_df


@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    try:
        content = await file.read()
        filename = file.filename.lower()
        
        if filename.endswith('.csv'):
            encoding = detect_encoding(content)
            try:
                df = pd.read_csv(io.BytesIO(content), encoding=encoding)
            except:
                df = pd.read_csv(io.BytesIO(content), encoding='utf-8-sig')
        elif filename.endswith(('.xlsx', '.xls')):
            df = pd.read_excel(io.BytesIO(content))
        elif filename.endswith('.json'):
            try:
                df = pd.read_json(io.BytesIO(content))
            except:
                json_data = json.loads(content.decode('utf-8'))
                if isinstance(json_data, list):
                    df = pd.DataFrame(json_data)
                else:
                    df = pd.DataFrame([json_data])
        else:
            raise HTTPException(status_code=400, detail="不支持的文件格式")
        
        dataset_id = str(uuid.uuid4())
        data_store[dataset_id] = df
        filter_store[dataset_id] = {'filters': []}
        
        info = get_dataframe_info(df)
        preview = df_to_records(df.head(100))
        
        return clean_for_json({
            'dataset_id': dataset_id,
            'filename': file.filename,
            'info': info,
            'preview': preview,
            'columns': list(df.columns)
        })
    except Exception as e:
        import traceback
        error_detail = traceback.format_exc()
        raise HTTPException(status_code=500, detail=str(e) + "\n" + error_detail)


@app.post("/api/database")
async def connect_database(config: DatabaseConfig):
    try:
        if config.db_type == 'sqlite':
            df = pd.read_sql_query(config.query, f"sqlite:///{config.database}")
        elif config.db_type == 'mysql':
            connection_str = f"mysql+mysqlconnector://{config.username}:{config.password}@{config.host}:{config.port}/{config.database}"
            df = pd.read_sql_query(config.query, connection_str)
        elif config.db_type == 'postgresql':
            connection_str = f"postgresql+psycopg2://{config.username}:{config.password}@{config.host}:{config.port}/{config.database}"
            df = pd.read_sql_query(config.query, connection_str)
        else:
            raise HTTPException(status_code=400, detail="不支持的数据库类型")
        
        for col in df.columns:
            if df[col].apply(lambda x: isinstance(x, (list, dict))).any():
                df[col] = df[col].apply(lambda x: str(x) if isinstance(x, (list, dict)) else x)
        
        dataset_id = str(uuid.uuid4())
        data_store[dataset_id] = df
        filter_store[dataset_id] = {'filters': []}
        
        info = get_dataframe_info(df)
        preview = df_to_records(df.head(100))
        
        return clean_for_json({
            'dataset_id': dataset_id,
            'info': info,
            'preview': preview,
            'columns': list(df.columns)
        })
    except Exception as e:
        import traceback
        error_detail = traceback.format_exc()
        raise HTTPException(status_code=500, detail=str(e) + "\n" + error_detail)


@app.get("/api/dataset/{dataset_id}/overview")
async def get_dataset_overview(dataset_id: str):
    if dataset_id not in data_store:
        raise HTTPException(status_code=404, detail="数据集不存在")
    
    df = data_store[dataset_id]
    info = get_dataframe_info(df)
    
    stats = {}
    for col in df.columns:
        col_type = info['column_types'][col]
        if col_type == 'numeric':
            series = df[col].dropna()
            stats[col] = {
                'mean': float(series.mean()) if len(series) > 0 else None,
                'median': float(series.median()) if len(series) > 0 else None,
                'std': float(series.std()) if len(series) > 0 else None,
                'min': float(series.min()) if len(series) > 0 else None,
                'max': float(series.max()) if len(series) > 0 else None,
                'q25': float(series.quantile(0.25)) if len(series) > 0 else None,
                'q75': float(series.quantile(0.75)) if len(series) > 0 else None
            }
        elif col_type == 'text':
            try:
                value_counts = df[col].astype(str).value_counts().head(20)
                mode_series = df[col].astype(str).mode()
                stats[col] = {
                    'value_counts': {str(k): int(v) for k, v in value_counts.items()},
                    'most_common': str(mode_series.iloc[0]) if not mode_series.empty else None
                }
            except:
                stats[col] = {
                    'value_counts': {},
                    'most_common': None
                }
        elif col_type == 'date':
            try:
                date_series = pd.to_datetime(df[col], errors='coerce')
                stats[col] = {
                    'min': date_series.min().isoformat() if not date_series.isnull().all() else None,
                    'max': date_series.max().isoformat() if not date_series.isnull().all() else None
                }
            except:
                stats[col] = {'min': None, 'max': None}
    
    numeric_cols = [col for col, t in info['column_types'].items() if t == 'numeric']
    correlation = None
    if len(numeric_cols) >= 2:
        try:
            corr_matrix = df[numeric_cols].corr()
            correlation = {
                'columns': numeric_cols,
                'data': [[float(v) if not pd.isna(v) else 0 for v in row] for row in corr_matrix.values.tolist()]
            }
        except:
            correlation = None
    
    total_cells = len(df) * len(df.columns)
    total_nulls = sum(info['null_counts'].values())
    data_quality = {
        'completeness': float(1 - total_nulls / total_cells) if total_cells > 0 else 1.0,
        'uniqueness': float(sum(info['unique_counts'].values()) / total_cells) if total_cells > 0 else 0.0,
        'score': float((1 - total_nulls / total_cells) * 100) if total_cells > 0 else 100.0
    }
    
    return clean_for_json({
        'info': info,
        'statistics': stats,
        'correlation': correlation,
        'data_quality': data_quality
    })


@app.get("/api/dataset/{dataset_id}/histogram/{column}")
async def get_histogram(dataset_id: str, column: str, bins: int = 20):
    if dataset_id not in data_store:
        raise HTTPException(status_code=404, detail="数据集不存在")
    
    df = data_store[dataset_id]
    if column not in df.columns:
        raise HTTPException(status_code=404, detail="列不存在")
    
    series = df[column].dropna()
    if len(series) == 0:
        return {'bins': [], 'counts': []}
    
    try:
        counts, bin_edges = np.histogram(series, bins=bins)
        return {
            'bins': [float(v) for v in bin_edges.tolist()],
            'counts': [int(v) for v in counts.tolist()]
        }
    except Exception as e:
        return {'bins': [], 'counts': [], 'error': str(e)}


@app.post("/api/chart")
async def get_chart_data(request: ChartRequest):
    if request.dataset_id not in data_store:
        raise HTTPException(status_code=404, detail="数据集不存在")
    
    df = data_store[request.dataset_id]
    filtered_df = apply_filters(df, request.filters)
    
    if len(filtered_df) == 0:
        return {'data': [], 'categories': []}
    
    try:
        if request.chart_type == 'line':
            if not request.x_column or not request.y_column:
                raise HTTPException(status_code=400, detail="需要指定 x 和 y 列")
            
            filtered_df[request.x_column] = filtered_df[request.x_column].astype(str)
            grouped = filtered_df.groupby(request.x_column)[request.y_column].mean().reset_index()
            return clean_for_json({
                'categories': grouped[request.x_column].astype(str).tolist(),
                'data': grouped[request.y_column].tolist()
            })
        
        elif request.chart_type == 'bar':
            if not request.x_column or not request.y_column:
                raise HTTPException(status_code=400, detail="需要指定 x 和 y 列")
            
            filtered_df[request.x_column] = filtered_df[request.x_column].astype(str)
            
            if request.category_column:
                filtered_df[request.category_column] = filtered_df[request.category_column].astype(str)
                grouped = filtered_df.groupby([request.x_column, request.category_column])[request.y_column].sum().unstack()
                categories = grouped.index.astype(str).tolist()
                series = []
                for cat_col in grouped.columns:
                    series.append({
                        'name': str(cat_col),
                        'data': [float(v) if not pd.isna(v) else 0 for v in grouped[cat_col].tolist()]
                    })
                return clean_for_json({'categories': categories, 'series': series})
            else:
                grouped = filtered_df.groupby(request.x_column)[request.y_column].sum().reset_index()
                return clean_for_json({
                    'categories': grouped[request.x_column].astype(str).tolist(),
                    'data': grouped[request.y_column].tolist()
                })
        
        elif request.chart_type == 'scatter':
            if not request.x_column or not request.y_column:
                raise HTTPException(status_code=400, detail="需要指定 x 和 y 列")
            
            data = filtered_df[[request.x_column, request.y_column]].dropna()
            return clean_for_json({
                'data': [[float(x), float(y)] for x, y in data.values.tolist()],
                'x_name': request.x_column,
                'y_name': request.y_column
            })
        
        elif request.chart_type in ['pie', 'ring']:
            if not request.x_column or not request.y_column:
                raise HTTPException(status_code=400, detail="需要指定名称和数值列")
            
            filtered_df[request.x_column] = filtered_df[request.x_column].astype(str)
            grouped = filtered_df.groupby(request.x_column)[request.y_column].sum().reset_index()
            return clean_for_json({
                'data': [{'name': str(row[request.x_column]), 'value': float(row[request.y_column])} for _, row in grouped.iterrows()]
            })
        
        elif request.chart_type == 'area':
            if not request.x_column or not request.y_column:
                raise HTTPException(status_code=400, detail="需要指定 x 和 y 列")
            
            filtered_df[request.x_column] = filtered_df[request.x_column].astype(str)
            grouped = filtered_df.groupby(request.x_column)[request.y_column].sum().reset_index()
            return clean_for_json({
                'categories': grouped[request.x_column].astype(str).tolist(),
                'data': grouped[request.y_column].tolist()
            })
        
        elif request.chart_type == 'box':
            if not request.x_column or not request.y_column:
                raise HTTPException(status_code=400, detail="需要指定 x 和 y 列")
            
            filtered_df[request.x_column] = filtered_df[request.x_column].astype(str)
            categories = filtered_df[request.x_column].unique().astype(str).tolist()
            box_data = []
            for cat in categories:
                subset = filtered_df[filtered_df[request.x_column].astype(str) == cat][request.y_column].dropna()
                if len(subset) > 0:
                    box_data.append([
                        float(subset.min()),
                        float(subset.quantile(0.25)),
                        float(subset.median()),
                        float(subset.quantile(0.75)),
                        float(subset.max())
                    ])
                else:
                    box_data.append([0, 0, 0, 0, 0])
            
            return clean_for_json({
                'categories': categories,
                'data': box_data
            })
        
        else:
            raise HTTPException(status_code=400, detail="不支持的图表类型")
    
    except Exception as e:
        import traceback
        raise HTTPException(status_code=500, detail=str(e) + "\n" + traceback.format_exc())


@app.get("/api/dataset/{dataset_id}/data")
async def get_dataset_data(
    dataset_id: str,
    page: int = 1,
    page_size: int = 50,
    sort_by: Optional[str] = None,
    sort_order: str = 'asc',
    search: Optional[str] = None
):
    if dataset_id not in data_store:
        raise HTTPException(status_code=404, detail="数据集不存在")
    
    df = data_store[dataset_id]
    filtered_df = df.copy()
    
    if search:
        mask = pd.Series([False] * len(filtered_df), index=filtered_df.index)
        for col in df.columns:
            try:
                col_mask = filtered_df[col].astype(str).str.contains(search, case=False, na=False)
                mask = mask | col_mask
            except:
                pass
        filtered_df = filtered_df[mask]
    
    if sort_by and sort_by in filtered_df.columns:
        try:
            filtered_df = filtered_df.sort_values(by=sort_by, ascending=(sort_order == 'asc'))
        except:
            pass
    
    total = len(filtered_df)
    total_pages = (total + page_size - 1) // page_size
    
    start = (page - 1) * page_size
    end = start + page_size
    page_data = df_to_records(filtered_df.iloc[start:end])
    
    return clean_for_json({
        'data': page_data,
        'total': total,
        'page': page,
        'page_size': page_size,
        'total_pages': total_pages,
        'columns': list(df.columns)
    })


@app.post("/api/dataset/{dataset_id}/filter")
async def apply_filter(dataset_id: str, filters: List[FilterConfig]):
    if dataset_id not in data_store:
        raise HTTPException(status_code=404, detail="数据集不存在")
    
    filter_store[dataset_id] = {'filters': [f.dict() for f in filters]}
    
    await manager.broadcast({
        'type': 'filter_update',
        'filters': [f.dict() for f in filters]
    }, dataset_id)
    
    return {'status': 'success', 'filters': [f.dict() for f in filters]}


@app.websocket("/ws/{dataset_id}")
async def websocket_endpoint(websocket: WebSocket, dataset_id: str):
    await manager.connect(websocket, dataset_id)
    try:
        while True:
            data = await websocket.receive_json()
            if data.get('type') == 'filter_update':
                filters = data.get('filters', [])
                filter_store[dataset_id] = {'filters': filters}
                await manager.broadcast({
                    'type': 'filter_update',
                    'filters': filters
                }, dataset_id)
    except WebSocketDisconnect:
        manager.disconnect(websocket, dataset_id)


@app.get("/api/dataset/{dataset_id}/export")
async def export_dataset(dataset_id: str, format: str = 'csv'):
    if dataset_id not in data_store:
        raise HTTPException(status_code=404, detail="数据集不存在")
    
    df = data_store[dataset_id]
    
    if format == 'csv':
        csv_content = df.to_csv(index=False)
        return JSONResponse(content={'data': csv_content, 'filename': f'export_{dataset_id}.csv'})
    else:
        raise HTTPException(status_code=400, detail="不支持的导出格式")


@app.get("/api/dataset/{dataset_id}/column-meta")
async def get_column_metadata(dataset_id: str, column: str):
    if dataset_id not in data_store:
        raise HTTPException(status_code=404, detail="数据集不存在")
    
    df = data_store[dataset_id]
    if column not in df.columns:
        raise HTTPException(status_code=404, detail="列不存在")
    
    series = df[column]
    col_type = infer_column_type(series)
    
    result = {
        'column': column,
        'type': col_type,
        'null_count': int(series.isnull().sum()),
        'unique_count': int(series.nunique()),
    }
    
    if col_type == 'numeric':
        clean_series = series.dropna()
        if len(clean_series) > 0:
            result['min'] = float(clean_series.min())
            result['max'] = float(clean_series.max())
            result['mean'] = float(clean_series.mean())
    elif col_type in ['text', 'boolean', 'date']:
        try:
            unique_values = series.dropna().astype(str).unique().tolist()
            result['unique_values'] = sorted(unique_values)[:100]
            result['has_more'] = len(unique_values) > 100
        except:
            result['unique_values'] = []
            result['has_more'] = False
    
    return clean_for_json(result)


@app.get("/api/health")
async def health_check():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
