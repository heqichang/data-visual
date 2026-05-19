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
from datetime import datetime, timedelta

from pipeline_engine import PipelineDAG, PipelineNode, PipelineExecutor

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
pipeline_store: Dict[str, Dict[str, Any]] = {}
dashboard_store: Dict[str, Dict[str, Any]] = {}
pipeline_executor = PipelineExecutor()


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
    config: Optional[Dict[str, Any]] = None


class PipelineExecuteRequest(BaseModel):
    dataset_id: str
    nodes: List[Dict[str, Any]]
    edges: List[List[str]]
    input_node_id: Optional[str] = None
    pipeline_id: Optional[str] = None


class PipelineSaveRequest(BaseModel):
    pipeline_id: Optional[str] = None
    name: str
    description: Optional[str] = None
    dataset_id: str
    nodes: List[Dict[str, Any]]
    edges: List[List[str]]


class PivotTableRequest(BaseModel):
    dataset_id: str
    rows: List[str]
    cols: List[str] = []
    columns: List[str] = []
    values: List[Dict[str, Any]]
    filters: List[FilterConfig] = []
    show_subtotals: bool = True
    show_totals: bool = True
    show_subtotal: bool = True
    show_grand_total: bool = True


class ComparisonRequest(BaseModel):
    dataset_id: str
    comparison_type: str
    config: Dict[str, Any]
    date_column: Optional[str] = None
    value_column: Optional[str] = None
    category_column: Optional[str] = None
    current_period: Optional[Dict[str, Any]] = None
    comparison_period: Optional[Dict[str, Any]] = None
    group_a: Optional[Dict[str, Any]] = None
    group_b: Optional[Dict[str, Any]] = None


class DashboardSaveRequest(BaseModel):
    dashboard_id: Optional[str] = None
    name: str
    description: Optional[str] = None
    layout: List[Dict[str, Any]]
    widgets: Dict[str, Dict[str, Any]]
    filters: List[Dict[str, Any]] = []
    variables: List[Dict[str, Any]] = []
    auto_refresh: Optional[int] = None


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
    filtered_df = apply_filters(df, request.filters).copy()
    
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
        
        elif request.chart_type == 'sankey':
            config = request.config or {}
            source_col = config.get('source_column')
            target_col = config.get('target_column')
            value_col = config.get('value_column')
            
            if not source_col or not target_col or not value_col:
                raise HTTPException(status_code=400, detail="需要指定源、目标和数值列")
            
            grouped = filtered_df.groupby([source_col, target_col])[value_col].sum().reset_index()
            
            all_nodes = list(set(grouped[source_col].astype(str).tolist() + grouped[target_col].astype(str).tolist()))
            node_index = {node: i for i, node in enumerate(all_nodes)}
            
            nodes = [{'name': node} for node in all_nodes]
            links = []
            for _, row in grouped.iterrows():
                links.append({
                    'source': node_index[str(row[source_col])],
                    'target': node_index[str(row[target_col])],
                    'value': float(row[value_col])
                })
            
            return clean_for_json({'nodes': nodes, 'links': links})
        
        elif request.chart_type == 'funnel':
            config = request.config or {}
            stage_col = config.get('stage_column', request.x_column)
            value_col = config.get('value_column', request.y_column)
            
            if not stage_col or not value_col:
                raise HTTPException(status_code=400, detail="需要指定阶段和数值列")
            
            filtered_df[stage_col] = filtered_df[stage_col].astype(str)
            grouped = filtered_df.groupby(stage_col)[value_col].sum().reset_index()
            grouped = grouped.sort_values(value_col, ascending=False)
            
            return clean_for_json({
                'data': [{'name': str(row[stage_col]), 'value': float(row[value_col])} for _, row in grouped.iterrows()]
            })
        
        elif request.chart_type == 'radar':
            config = request.config or {}
            category_col = config.get('category_column', request.category_column)
            indicator_cols = config.get('indicator_columns', [request.y_column] if request.y_column else [])
            
            if not indicator_cols:
                raise HTTPException(status_code=400, detail="需要指定指标列")
            
            indicators = []
            for col in indicator_cols:
                if col in filtered_df.columns:
                    max_val = float(filtered_df[col].max()) if pd.api.types.is_numeric_dtype(filtered_df[col]) else 100
                    indicators.append({'name': col, 'max': max_val})
            
            if category_col and category_col in filtered_df.columns:
                filtered_df[category_col] = filtered_df[category_col].astype(str)
                grouped = filtered_df.groupby(category_col)[indicator_cols].mean().reset_index()
                series = []
                for _, row in grouped.iterrows():
                    series.append({
                        'name': str(row[category_col]),
                        'value': [float(row[col]) for col in indicator_cols]
                    })
            else:
                series = [{
                    'name': '综合',
                    'value': [float(filtered_df[col].mean()) for col in indicator_cols if col in filtered_df.columns]
                }]
            
            return clean_for_json({'indicators': indicators, 'series': series})
        
        elif request.chart_type == 'heatmap':
            config = request.config or {}
            x_col = config.get('x_column', request.x_column)
            y_col = config.get('y_column', request.category_column)
            value_col = config.get('value_column', request.y_column)
            
            if not x_col or not y_col or not value_col:
                raise HTTPException(status_code=400, detail="需要指定 x、y 和数值列")
            
            filtered_df[x_col] = filtered_df[x_col].astype(str)
            filtered_df[y_col] = filtered_df[y_col].astype(str)
            
            pivot = filtered_df.pivot_table(index=y_col, columns=x_col, values=value_col, aggfunc='mean')
            
            x_categories = pivot.columns.astype(str).tolist()
            y_categories = pivot.index.astype(str).tolist()
            data = []
            for i, y in enumerate(y_categories):
                for j, x in enumerate(x_categories):
                    val = pivot.iloc[i, j]
                    if not pd.isna(val):
                        data.append([j, i, float(val)])
            
            return clean_for_json({
                'x_categories': x_categories,
                'y_categories': y_categories,
                'data': data
            })
        
        elif request.chart_type == 'calendar_heatmap':
            config = request.config or {}
            date_col = config.get('date_column', request.x_column)
            value_col = config.get('value_column', request.y_column)
            
            if not date_col or not value_col:
                raise HTTPException(status_code=400, detail="需要指定日期和数值列")
            
            filtered_df[date_col] = pd.to_datetime(filtered_df[date_col], errors='coerce')
            filtered_df = filtered_df.dropna(subset=[date_col])
            
            grouped = filtered_df.groupby(filtered_df[date_col].dt.date)[value_col].sum().reset_index()
            grouped.columns = ['date', 'value']
            
            data = []
            for _, row in grouped.iterrows():
                data.append([row['date'].isoformat(), float(row['value'])])
            
            return clean_for_json({'data': data})
        
        elif request.chart_type == 'treemap':
            config = request.config or {}
            hierarchy_cols = config.get('hierarchy_columns', [request.category_column] if request.category_column else [])
            value_col = config.get('value_column', request.y_column)
            
            if not hierarchy_cols or not value_col:
                raise HTTPException(status_code=400, detail="需要指定层级和数值列")
            
            def build_tree(data, level=0):
                if level >= len(hierarchy_cols):
                    return []
                
                col = hierarchy_cols[level]
                if col not in data.columns:
                    return []
                
                grouped = data.groupby(col)[value_col].sum().reset_index()
                result = []
                for _, row in grouped.iterrows():
                    name = str(row[col])
                    value = float(row[value_col])
                    
                    if level < len(hierarchy_cols) - 1:
                        children = build_tree(data[data[col].astype(str) == name], level + 1)
                        result.append({'name': name, 'value': value, 'children': children})
                    else:
                        result.append({'name': name, 'value': value})
                
                return result
            
            tree_data = build_tree(filtered_df)
            return clean_for_json({'data': tree_data})
        
        elif request.chart_type == 'sunburst':
            config = request.config or {}
            hierarchy_cols = config.get('hierarchy_columns', [request.category_column] if request.category_column else [])
            value_col = config.get('value_column', request.y_column)
            
            if not hierarchy_cols or not value_col:
                raise HTTPException(status_code=400, detail="需要指定层级和数值列")
            
            def build_tree(data, level=0):
                if level >= len(hierarchy_cols):
                    return []
                
                col = hierarchy_cols[level]
                if col not in data.columns:
                    return []
                
                grouped = data.groupby(col)[value_col].sum().reset_index()
                result = []
                for _, row in grouped.iterrows():
                    name = str(row[col])
                    value = float(row[value_col])
                    
                    if level < len(hierarchy_cols) - 1:
                        children = build_tree(data[data[col].astype(str) == name], level + 1)
                        result.append({'name': name, 'value': value, 'children': children})
                    else:
                        result.append({'name': name, 'value': value})
                
                return result
            
            tree_data = build_tree(filtered_df)
            return clean_for_json({'data': tree_data})
        
        elif request.chart_type == 'combo':
            config = request.config or {}
            x_col = config.get('x_column', request.x_column)
            bar_col = config.get('bar_column')
            line_col = config.get('line_column')
            
            if not x_col or not bar_col or not line_col:
                raise HTTPException(status_code=400, detail="需要指定 x、柱状图和折线图列")
            
            filtered_df[x_col] = filtered_df[x_col].astype(str)
            grouped = filtered_df.groupby(x_col).agg({
                bar_col: 'sum',
                line_col: 'mean'
            }).reset_index()
            
            categories = grouped[x_col].astype(str).tolist()
            bar_data = [float(v) if not pd.isna(v) else 0 for v in grouped[bar_col].tolist()]
            line_data = [float(v) if not pd.isna(v) else 0 for v in grouped[line_col].tolist()]
            
            return clean_for_json({
                'categories': categories,
                'bar_data': bar_data,
                'line_data': line_data,
                'bar_name': bar_col,
                'line_name': line_col
            })
        
        elif request.chart_type == 'waterfall':
            config = request.config or {}
            category_col = config.get('category_column', request.x_column)
            value_col = config.get('value_column', request.y_column)
            
            if not category_col or not value_col:
                raise HTTPException(status_code=400, detail="需要指定类别和数值列")
            
            filtered_df[category_col] = filtered_df[category_col].astype(str)
            grouped = filtered_df.groupby(category_col)[value_col].sum().reset_index()
            
            categories = grouped[category_col].astype(str).tolist()
            values = [float(v) for v in grouped[value_col].tolist()]
            
            running_total = 0
            waterfall_data = []
            for i, (cat, val) in enumerate(zip(categories, values)):
                if i == 0:
                    waterfall_data.append({'name': cat, 'value': val, 'type': 'total'})
                elif i == len(values) - 1:
                    running_total += val
                    waterfall_data.append({'name': cat, 'value': running_total, 'type': 'total'})
                else:
                    waterfall_data.append({'name': cat, 'value': val, 'type': 'increase' if val >= 0 else 'decrease'})
                    running_total += val
            
            return clean_for_json({'data': waterfall_data})
        
        else:
            raise HTTPException(status_code=400, detail="不支持的图表类型")
    
    except HTTPException:
        raise
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


@app.post("/api/pipeline/execute")
async def execute_pipeline(request: PipelineExecuteRequest):
    if request.dataset_id not in data_store:
        raise HTTPException(status_code=404, detail="数据集不存在")
    
    try:
        dag = PipelineDAG()
        
        for node_data in request.nodes:
            node = PipelineNode(
                node_id=node_data['id'],
                node_type=node_data['type'],
                config=node_data.get('config', {}),
                enabled=node_data.get('enabled', True)
            )
            dag.add_node(node)
        
        for edge in request.edges:
            dag.add_edge(edge[0], edge[1])
        
        input_data = {}
        if request.input_node_id:
            input_data[request.input_node_id] = data_store[request.dataset_id]
        else:
            source_nodes = [nid for nid, node in dag.nodes.items() if not node.inputs]
            if source_nodes:
                input_data[source_nodes[0]] = data_store[request.dataset_id]
        
        result = pipeline_executor.execute_with_preview(dag, input_data)
        
        return clean_for_json({
            'previews': result['previews'],
            'execution_order': result['execution_order'],
            'status': 'success'
        })
    
    except Exception as e:
        import traceback
        raise HTTPException(status_code=500, detail=str(e) + "\n" + traceback.format_exc())


@app.post("/api/pipeline/save")
async def save_pipeline(request: PipelineSaveRequest):
    pipeline_id = request.pipeline_id or str(uuid.uuid4())
    
    pipeline_store[pipeline_id] = {
        'pipeline_id': pipeline_id,
        'name': request.name,
        'description': request.description,
        'dataset_id': request.dataset_id,
        'nodes': request.nodes,
        'edges': request.edges,
        'created_at': datetime.now().isoformat(),
        'updated_at': datetime.now().isoformat()
    }
    
    return {'status': 'success', 'pipeline_id': pipeline_id}


@app.get("/api/pipeline/list")
async def list_pipelines(dataset_id: Optional[str] = None):
    pipelines = list(pipeline_store.values())
    if dataset_id:
        pipelines = [p for p in pipelines if p['dataset_id'] == dataset_id]
    return {'pipelines': pipelines}


@app.get("/api/pipeline/{pipeline_id}")
async def get_pipeline(pipeline_id: str):
    if pipeline_id not in pipeline_store:
        raise HTTPException(status_code=404, detail="管道不存在")
    return pipeline_store[pipeline_id]


@app.delete("/api/pipeline/{pipeline_id}")
async def delete_pipeline(pipeline_id: str):
    if pipeline_id not in pipeline_store:
        raise HTTPException(status_code=404, detail="管道不存在")
    del pipeline_store[pipeline_id]
    return {'status': 'success'}


@app.post("/api/pivot")
async def create_pivot_table(request: PivotTableRequest):
    if request.dataset_id not in data_store:
        raise HTTPException(status_code=404, detail="数据集不存在")
    
    df = data_store[request.dataset_id]
    filtered_df = apply_filters(df, request.filters).copy()
    
    try:
        valid_rows = [col for col in request.rows if col in filtered_df.columns]
        valid_cols = [col for col in (request.cols or request.columns) if col in filtered_df.columns]
        
        agg_dict = {}
        for val_config in request.values:
            col = val_config.get('column')
            agg_func = val_config.get('aggregation', val_config.get('agg_func', 'sum'))
            if col in filtered_df.columns:
                agg_dict[col] = agg_func
        
        if not valid_rows or not agg_dict:
            raise HTTPException(status_code=400, detail="需要指定行和值")
        
        value_cols = list(agg_dict.keys())
        conflicting_cols = [col for col in valid_cols if col in value_cols]
        if conflicting_cols:
            raise HTTPException(
                status_code=400, 
                detail=f"列字段不能与值字段重复。冲突的字段: {', '.join(conflicting_cols)}。列字段用于分组，值字段用于聚合计算，请选择不同的列。"
            )
        
        pivot = pd.pivot_table(
            filtered_df,
            index=valid_rows,
            columns=valid_cols if valid_cols else None,
            values=value_cols,
            aggfunc=agg_dict,
            fill_value=0
        )
        
        show_subtotal = request.show_subtotal or request.show_subtotals
        show_grand_total = request.show_grand_total or request.show_totals
        
        pivot = pivot.reset_index()
        
        if isinstance(pivot.columns, pd.MultiIndex):
            pivot.columns = ['_'.join([str(c) for c in col if c]).strip() for col in pivot.columns]
        
        row_headers = valid_rows
        data_columns = [col for col in pivot.columns if col not in valid_rows]
        table_data = []
        for _, row in pivot.iterrows():
            row_data = [row[header] for header in row_headers]
            for col in data_columns:
                row_data.append(clean_value(row[col]))
            table_data.append(row_data)
        
        return clean_for_json({
            'row_headers': row_headers,
            'columns': data_columns,
            'data': table_data,
            'row_fields': valid_rows,
            'column_fields': valid_cols,
            'value_fields': request.values
        })
    
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        raise HTTPException(status_code=500, detail=str(e) + "\n" + traceback.format_exc())


@app.post("/api/pivot/detail")
async def pivot_table_detail(request: Dict[str, Any]):
    dataset_id = request.get('dataset_id')
    if dataset_id not in data_store:
        raise HTTPException(status_code=404, detail="数据集不存在")
    
    df = data_store[dataset_id]
    
    try:
        rows = request.get('rows', [])
        cols = request.get('cols', [])
        row_index = request.get('row_index', 0)
        col_index = request.get('col_index', 0)
        
        filtered_df = df.copy()
        
        data = df_to_records(filtered_df.head(100))
        
        return clean_for_json({
            'data': data,
            'total': len(filtered_df),
            'columns': list(filtered_df.columns)
        })
    
    except Exception as e:
        import traceback
        raise HTTPException(status_code=500, detail=str(e) + "\n" + traceback.format_exc())


@app.post("/api/pivot/export")
async def export_pivot(request: Dict[str, Any]):
    dataset_id = request.get('dataset_id')
    if dataset_id not in data_store:
        raise HTTPException(status_code=404, detail="数据集不存在")
    
    df = data_store[dataset_id]
    format_type = request.get('format', 'csv')
    
    try:
        rows = request.get('rows', [])
        cols = request.get('cols', [])
        values = request.get('values', [])
        
        valid_rows = [col for col in rows if col in df.columns]
        valid_cols = [col for col in cols if col in df.columns]
        
        agg_dict = {}
        for val_config in values:
            col = val_config.get('column')
            agg_func = val_config.get('aggregation', 'sum')
            if col in df.columns:
                agg_dict[col] = agg_func
        
        if valid_rows and agg_dict:
            pivot = pd.pivot_table(
                df,
                index=valid_rows,
                columns=valid_cols if valid_cols else None,
                values=list(agg_dict.keys()),
                aggfunc=agg_dict,
                fill_value=0
            )
            pivot = pivot.reset_index()
        else:
            pivot = df
        
        if format_type == 'csv':
            csv_content = pivot.to_csv(index=False)
            return JSONResponse(content={'data': csv_content, 'filename': 'pivot_table.csv'})
        else:
            output = io.BytesIO()
            with pd.ExcelWriter(output, engine='openpyxl') as writer:
                pivot.to_excel(writer, index=False, sheet_name='PivotTable')
            excel_content = output.getvalue()
            import base64
            return JSONResponse(content={
                'data': base64.b64encode(excel_content).decode('utf-8'),
                'filename': 'pivot_table.xlsx'
            })
    
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        raise HTTPException(status_code=500, detail=str(e) + "\n" + traceback.format_exc())


@app.post("/api/pivot-table")
async def create_pivot_table_legacy(request: PivotTableRequest):
    return await create_pivot_table(request)


@app.post("/api/pivot-table/drilldown")
async def pivot_table_drilldown(
    dataset_id: str,
    row_values: Dict[str, Any],
    column_values: Optional[Dict[str, Any]] = None,
    filters: List[FilterConfig] = []
):
    if dataset_id not in data_store:
        raise HTTPException(status_code=404, detail="数据集不存在")
    
    df = data_store[dataset_id]
    filtered_df = apply_filters(df, filters)
    
    try:
        for col, val in row_values.items():
            if col in filtered_df.columns:
                filtered_df = filtered_df[filtered_df[col].astype(str) == str(val)]
        
        if column_values:
            for col, val in column_values.items():
                if col in filtered_df.columns:
                    filtered_df = filtered_df[filtered_df[col].astype(str) == str(val)]
        
        data = df_to_records(filtered_df.head(1000))
        
        return clean_for_json({
            'data': data,
            'total': len(filtered_df),
            'columns': list(filtered_df.columns)
        })
    
    except Exception as e:
        import traceback
        raise HTTPException(status_code=500, detail=str(e) + "\n" + traceback.format_exc())


@app.post("/api/comparison")
async def compare_data(request: ComparisonRequest):
    if request.dataset_id not in data_store:
        raise HTTPException(status_code=404, detail="数据集不存在")
    
    df = data_store[request.dataset_id].copy()
    config = request.config or {}
    
    try:
        if request.comparison_type == 'time_period':
            date_col = config.get('date_column')
            value_col = config.get('value_column')
            period_type = config.get('period_type', 'month_over_month')
            
            if not date_col or not value_col:
                raise HTTPException(status_code=400, detail="需要指定日期和数值列")
            
            df[date_col] = pd.to_datetime(df[date_col], errors='coerce')
            df = df.dropna(subset=[date_col])
            
            if period_type == 'year_over_year':
                df['year'] = df[date_col].dt.year
                df['month'] = df[date_col].dt.month
                grouped = df.groupby(['year', 'month'])[value_col].sum().reset_index()
                
                current_year = grouped[grouped['year'] == grouped['year'].max()]
                previous_year = grouped[grouped['year'] == grouped['year'].max() - 1]
                
                time_period_data = []
                if len(current_year) > 0 and len(previous_year) > 0:
                    merged = current_year.merge(previous_year, on='month', suffixes=('_current', '_previous'))
                    for _, row in merged.iterrows():
                        period = f"{int(row['year_current'])}-{int(row['month']):02d}"
                        current_val = float(row[f'{value_col}_current'])
                        previous_val = float(row[f'{value_col}_previous'])
                        diff = current_val - previous_val
                        growth_rate = (diff / previous_val) if previous_val != 0 else 0
                        time_period_data.append({
                            'period': period,
                            'current': current_val,
                            'previous': previous_val,
                            'difference': diff,
                            'growth_rate': growth_rate
                        })
            elif period_type == 'week_over_week':
                iso_cal = df[date_col].dt.isocalendar()
                df['year'] = iso_cal['year'].astype(int)
                df['week'] = iso_cal['week'].astype(int)
                grouped = df.groupby(['year', 'week'])[value_col].sum().reset_index()
                
                time_period_data = []
                for i in range(1, len(grouped)):
                    current = grouped.iloc[i]
                    prev = grouped.iloc[i - 1]
                    period = f"{int(current['year'])} W{int(current['week']):02d}"
                    current_val = float(current[value_col])
                    previous_val = float(prev[value_col])
                    diff = current_val - previous_val
                    growth_rate = (diff / previous_val) if previous_val != 0 else 0
                    time_period_data.append({
                        'period': period,
                        'current': current_val,
                        'previous': previous_val,
                        'difference': diff,
                        'growth_rate': growth_rate
                    })
            else:
                df['year'] = df[date_col].dt.year
                df['month'] = df[date_col].dt.month
                grouped = df.groupby(['year', 'month'])[value_col].sum().reset_index()
                
                time_period_data = []
                for i in range(1, len(grouped)):
                    current = grouped.iloc[i]
                    prev = grouped.iloc[i - 1]
                    period = f"{int(current['year'])}-{int(current['month']):02d}"
                    current_val = float(current[value_col])
                    previous_val = float(prev[value_col])
                    diff = current_val - previous_val
                    growth_rate = (diff / previous_val) if previous_val != 0 else 0
                    time_period_data.append({
                        'period': period,
                        'current': current_val,
                        'previous': previous_val,
                        'difference': diff,
                        'growth_rate': growth_rate
                    })
            
            if time_period_data:
                summary = {
                    'total_difference': sum(d['difference'] for d in time_period_data),
                    'avg_difference': sum(d['difference'] for d in time_period_data) / len(time_period_data),
                    'max_difference': max(d['difference'] for d in time_period_data),
                    'min_difference': min(d['difference'] for d in time_period_data)
                }
            else:
                summary = None
            
            return clean_for_json({
                'time_period_data': time_period_data,
                'summary': summary
            })
        
        elif request.comparison_type == 'group':
            group_col = config.get('group_column')
            group_a_value = config.get('group_a_value')
            group_b_value = config.get('group_b_value')
            value_columns = config.get('value_columns', [])
            
            if not group_col or not group_a_value or not group_b_value or not value_columns:
                raise HTTPException(status_code=400, detail="需要指定分组列、A/B组值和数值列")
            
            group_a_df = df[df[group_col].astype(str) == str(group_a_value)]
            group_b_df = df[df[group_col].astype(str) == str(group_b_value)]
            
            group_data = []
            for val_col in value_columns:
                if val_col in df.columns and pd.api.types.is_numeric_dtype(df[val_col]):
                    a_val = float(group_a_df[val_col].mean()) if len(group_a_df) > 0 else 0
                    b_val = float(group_b_df[val_col].mean()) if len(group_b_df) > 0 else 0
                    diff = a_val - b_val
                    diff_pct = (diff / b_val) if b_val != 0 else 0
                    group_data.append({
                        'metric': val_col,
                        'group_a': a_val,
                        'group_b': b_val,
                        'difference': diff,
                        'difference_percent': diff_pct
                    })
            
            if group_data:
                summary = {
                    'total_difference': sum(d['difference'] for d in group_data),
                    'avg_difference': sum(d['difference'] for d in group_data) / len(group_data),
                    'max_difference': max(d['difference'] for d in group_data),
                    'min_difference': min(d['difference'] for d in group_data)
                }
            else:
                summary = None
            
            return clean_for_json({
                'group_data': group_data,
                'summary': summary
            })
        
        elif request.comparison_type == 'time':
            if not request.date_column or not request.value_column:
                request.date_column = config.get('date_column')
                request.value_column = config.get('value_column')
            
            df[request.date_column] = pd.to_datetime(df[request.date_column], errors='coerce')
            df = df.dropna(subset=[request.date_column])
            
            current_start = pd.to_datetime(request.current_period['start'])
            current_end = pd.to_datetime(request.current_period['end'])
            compare_start = pd.to_datetime(request.comparison_period['start'])
            compare_end = pd.to_datetime(request.comparison_period['end'])
            
            current_df = df[(df[request.date_column] >= current_start) & (df[request.date_column] <= current_end)]
            compare_df = df[(df[request.date_column] >= compare_start) & (df[request.date_column] <= compare_end)]
            
            if request.category_column and request.category_column in df.columns:
                current_grouped = current_df.groupby(request.category_column)[request.value_column].sum().reset_index()
                compare_grouped = compare_df.groupby(request.category_column)[request.value_column].sum().reset_index()
                
                merged = current_grouped.merge(compare_grouped, on=request.category_column, how='outer', suffixes=('_current', '_compare'))
                merged = merged.fillna(0)
                merged['diff'] = merged[f'{request.value_column}_current'] - merged[f'{request.value_column}_compare']
                merged['diff_pct'] = (merged['diff'] / merged[f'{request.value_column}_compare'] * 100).round(2)
                
                return clean_for_json({
                    'comparison_type': 'time',
                    'categories': merged[request.category_column].astype(str).tolist(),
                    'current_values': [float(v) for v in merged[f'{request.value_column}_current'].tolist()],
                    'compare_values': [float(v) for v in merged[f'{request.value_column}_compare'].tolist()],
                    'differences': [float(v) for v in merged['diff'].tolist()],
                    'difference_percentages': [float(v) if not pd.isna(v) and not np.isinf(v) else None for v in merged['diff_pct'].tolist()]
                })
            else:
                current_sum = float(current_df[request.value_column].sum())
                compare_sum = float(compare_df[request.value_column].sum())
                diff = current_sum - compare_sum
                diff_pct = (diff / compare_sum * 100) if compare_sum != 0 else None
                
                return clean_for_json({
                    'comparison_type': 'time',
                    'current_value': current_sum,
                    'compare_value': compare_sum,
                    'difference': diff,
                    'difference_percentage': diff_pct
                })
        
        elif request.comparison_type == 'ab':
            if not request.group_a or not request.group_b:
                request.group_a = {config.get('group_column'): config.get('group_a_value')}
                request.group_b = {config.get('group_column'): config.get('group_b_value')}
                request.value_column = config.get('value_columns', [None])[0]
            
            group_a_df = df.copy()
            for col, val in request.group_a.items():
                if col in group_a_df.columns:
                    group_a_df = group_a_df[group_a_df[col].astype(str) == str(val)]
            
            group_b_df = df.copy()
            for col, val in request.group_b.items():
                if col in group_b_df.columns:
                    group_b_df = group_b_df[group_b_df[col].astype(str) == str(val)]
            
            if request.category_column and request.category_column in df.columns:
                a_grouped = group_a_df.groupby(request.category_column)[request.value_column].sum().reset_index()
                b_grouped = group_b_df.groupby(request.category_column)[request.value_column].sum().reset_index()
                
                merged = a_grouped.merge(b_grouped, on=request.category_column, how='outer', suffixes=('_a', '_b'))
                merged = merged.fillna(0)
                merged['diff'] = merged[f'{request.value_column}_a'] - merged[f'{request.value_column}_b']
                merged['diff_pct'] = (merged['diff'] / merged[f'{request.value_column}_b'] * 100).round(2)
                
                return clean_for_json({
                    'comparison_type': 'ab',
                    'categories': merged[request.category_column].astype(str).tolist(),
                    'group_a_values': [float(v) for v in merged[f'{request.value_column}_a'].tolist()],
                    'group_b_values': [float(v) for v in merged[f'{request.value_column}_b'].tolist()],
                    'differences': [float(v) for v in merged['diff'].tolist()],
                    'difference_percentages': [float(v) if not pd.isna(v) and not np.isinf(v) else None for v in merged['diff_pct'].tolist()]
                })
            else:
                a_sum = float(group_a_df[request.value_column].sum()) if request.value_column else 0
                b_sum = float(group_b_df[request.value_column].sum()) if request.value_column else 0
                diff = a_sum - b_sum
                diff_pct = (diff / b_sum * 100) if b_sum != 0 else None
                
                return clean_for_json({
                    'comparison_type': 'ab',
                    'group_a_value': a_sum,
                    'group_b_value': b_sum,
                    'difference': diff,
                    'difference_percentage': diff_pct
                })
        
        else:
            raise HTTPException(status_code=400, detail="不支持的对比类型")
    
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        raise HTTPException(status_code=500, detail=str(e) + "\n" + traceback.format_exc())


@app.post("/api/dashboard/save")
async def save_dashboard(request: DashboardSaveRequest):
    dashboard_id = request.dashboard_id or str(uuid.uuid4())
    
    dashboard_store[dashboard_id] = {
        'dashboard_id': dashboard_id,
        'name': request.name,
        'description': request.description,
        'layout': request.layout,
        'widgets': request.widgets,
        'filters': request.filters,
        'variables': request.variables,
        'auto_refresh': request.auto_refresh,
        'created_at': datetime.now().isoformat(),
        'updated_at': datetime.now().isoformat()
    }
    
    return {'status': 'success', 'dashboard_id': dashboard_id}


@app.get("/api/dashboard/list")
async def list_dashboards():
    return {'dashboards': list(dashboard_store.values())}


@app.get("/api/dashboard/{dashboard_id}")
async def get_dashboard(dashboard_id: str):
    if dashboard_id not in dashboard_store:
        raise HTTPException(status_code=404, detail="仪表盘不存在")
    return dashboard_store[dashboard_id]


@app.delete("/api/dashboard/{dashboard_id}")
async def delete_dashboard(dashboard_id: str):
    if dashboard_id not in dashboard_store:
        raise HTTPException(status_code=404, detail="仪表盘不存在")
    del dashboard_store[dashboard_id]
    return {'status': 'success'}


@app.post("/api/dashboard/{dashboard_id}/widget-data")
async def get_dashboard_widget_data(dashboard_id: str, widget_id: str, dataset_id: str, config: Dict[str, Any]):
    if dashboard_id not in dashboard_store:
        raise HTTPException(status_code=404, detail="仪表盘不存在")
    if dataset_id not in data_store:
        raise HTTPException(status_code=404, detail="数据集不存在")
    
    widget_type = config.get('type', 'chart')
    chart_type = config.get('chart_type', 'bar')
    
    try:
        chart_request = ChartRequest(
            dataset_id=dataset_id,
            chart_type=chart_type,
            x_column=config.get('x_column'),
            y_column=config.get('y_column'),
            category_column=config.get('category_column'),
            filters=[FilterConfig(**f) for f in config.get('filters', [])],
            config=config
        )
        
        result = await get_chart_data(chart_request)
        return result
    
    except Exception as e:
        return {'error': str(e), 'data': []}


@app.get("/api/health")
async def health_check():
    return {"status": "ok"}


from modules.streaming import streaming_router
from modules.sql_editor import sql_router
from modules.collaboration import collaboration_router
from modules.alerting import alert_router
from modules.analytics import analytics_router
from modules.lineage import lineage_router

app.include_router(streaming_router)
app.include_router(sql_router)
app.include_router(collaboration_router)
app.include_router(alert_router)
app.include_router(analytics_router)
app.include_router(lineage_router)


@app.on_event("startup")
async def startup_event():
    from modules.alerting import alert_engine
    await alert_engine.start_periodic_check(interval=60)


@app.on_event("shutdown")
async def shutdown_event():
    from modules.alerting import alert_engine
    alert_engine.stop_periodic_check()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
