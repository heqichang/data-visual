import uuid
import time
import re
from datetime import datetime
from typing import Dict, List, Any, Optional, Tuple
from pydantic import BaseModel
import pandas as pd
import sqlglot

from main import data_store, clean_for_json, df_to_records


class SQLQueryRequest(BaseModel):
    sql: str
    connection_id: Optional[str] = None
    database_config: Optional[Dict[str, Any]] = None
    explain: bool = False
    max_rows: int = 1000


class SQLQueryResult(BaseModel):
    query_id: str
    sql: str
    status: str
    data: Optional[List[Dict[str, Any]]] = None
    columns: Optional[List[str]] = None
    row_count: int = 0
    execution_time: float = 0.0
    error: Optional[str] = None
    explain_result: Optional[List[Dict[str, Any]]] = None


class QueryHistoryItem(BaseModel):
    query_id: str
    sql: str
    status: str
    execution_time: float
    timestamp: str
    row_count: int
    error: Optional[str] = None


class SQLTemplate(BaseModel):
    template_id: str
    name: str
    description: str
    sql: str
    parameters: List[Dict[str, Any]] = []
    category: str = "general"
    created_at: str


class SQLEngine:
    def __init__(self):
        self.query_history: List[QueryHistoryItem] = []
        self.templates: List[SQLTemplate] = self._init_default_templates()
        self.connections: Dict[str, Dict[str, Any]] = {}

    def _init_default_templates(self) -> List[SQLTemplate]:
        return [
            SQLTemplate(
                template_id=str(uuid.uuid4()),
                name="基础查询",
                description="从数据集选择所有列",
                sql="SELECT * FROM {table_name} LIMIT 100",
                parameters=[{"name": "table_name", "type": "string", "description": "表名/数据集ID"}],
                category="基础",
                created_at=datetime.now().isoformat(),
            ),
            SQLTemplate(
                template_id=str(uuid.uuid4()),
                name="分组聚合",
                description="按列分组并聚合",
                sql="SELECT {group_column}, COUNT(*) as count, SUM({value_column}) as total FROM {table_name} GROUP BY {group_column} ORDER BY total DESC",
                parameters=[
                    {"name": "table_name", "type": "string", "description": "表名/数据集ID"},
                    {"name": "group_column", "type": "string", "description": "分组列"},
                    {"name": "value_column", "type": "string", "description": "聚合列"},
                ],
                category="聚合",
                created_at=datetime.now().isoformat(),
            ),
            SQLTemplate(
                template_id=str(uuid.uuid4()),
                name="Top N 查询",
                description="获取前N条记录",
                sql="SELECT * FROM {table_name} ORDER BY {order_column} DESC LIMIT {limit}",
                parameters=[
                    {"name": "table_name", "type": "string", "description": "表名/数据集ID"},
                    {"name": "order_column", "type": "string", "description": "排序列"},
                    {"name": "limit", "type": "integer", "description": "返回条数", "default": 10},
                ],
                category="基础",
                created_at=datetime.now().isoformat(),
            ),
            SQLTemplate(
                template_id=str(uuid.uuid4()),
                name="日期范围查询",
                description="查询指定日期范围的数据",
                sql="SELECT * FROM {table_name} WHERE {date_column} BETWEEN '{start_date}' AND '{end_date}'",
                parameters=[
                    {"name": "table_name", "type": "string", "description": "表名/数据集ID"},
                    {"name": "date_column", "type": "string", "description": "日期列"},
                    {"name": "start_date", "type": "date", "description": "开始日期"},
                    {"name": "end_date", "type": "date", "description": "结束日期"},
                ],
                category="筛选",
                created_at=datetime.now().isoformat(),
            ),
            SQLTemplate(
                template_id=str(uuid.uuid4()),
                name="去重查询",
                description="获取某列的唯一值",
                sql="SELECT DISTINCT {column} FROM {table_name}",
                parameters=[
                    {"name": "table_name", "type": "string", "description": "表名/数据集ID"},
                    {"name": "column", "type": "string", "description": "列名"},
                ],
                category="基础",
                created_at=datetime.now().isoformat(),
            ),
        ]

    def _extract_table_name(self, sql: str) -> Optional[str]:
        try:
            parsed = sqlglot.parse_one(sql)
            for table in parsed.find_all(sqlglot.exp.Table):
                return table.name
        except Exception:
            match = re.search(r'FROM\s+([\w-]+)', sql, re.IGNORECASE)
            if match:
                return match.group(1)
        return None

    def execute_query(self, request: SQLQueryRequest) -> SQLQueryResult:
        query_id = str(uuid.uuid4())
        start_time = time.time()
        sql = request.sql.strip()
        
        try:
            table_name = self._extract_table_name(sql)
            
            if table_name and table_name in data_store:
                result_df = self._execute_pandas_sql(sql, table_name, data_store[table_name])
            else:
                result_df = self._execute_external_sql(sql, request.database_config)
            
            execution_time = time.time() - start_time
            
            columns = list(result_df.columns)
            data = df_to_records(result_df.head(request.max_rows))
            
            explain_result = None
            if request.explain:
                explain_result = self._explain_query(sql, result_df)
            
            history_item = QueryHistoryItem(
                query_id=query_id,
                sql=sql,
                status="success",
                execution_time=execution_time,
                timestamp=datetime.now().isoformat(),
                row_count=len(result_df),
            )
            self.query_history.insert(0, history_item)
            if len(self.query_history) > 100:
                self.query_history.pop()
            
            return SQLQueryResult(
                query_id=query_id,
                sql=sql,
                status="success",
                data=data,
                columns=columns,
                row_count=len(result_df),
                execution_time=execution_time,
                explain_result=explain_result,
            )
            
        except Exception as e:
            execution_time = time.time() - start_time
            
            history_item = QueryHistoryItem(
                query_id=query_id,
                sql=sql,
                status="error",
                execution_time=execution_time,
                timestamp=datetime.now().isoformat(),
                row_count=0,
                error=str(e),
            )
            self.query_history.insert(0, history_item)
            if len(self.query_history) > 100:
                self.query_history.pop()
            
            return SQLQueryResult(
                query_id=query_id,
                sql=sql,
                status="error",
                execution_time=execution_time,
                error=str(e),
            )

    def _execute_pandas_sql(self, sql: str, table_name: str, df: pd.DataFrame) -> pd.DataFrame:
        sql_lower = sql.lower()
        
        select_match = re.match(r'select\s+(.*?)\s+from', sql, re.IGNORECASE | re.DOTALL)
        where_match = re.search(r'where\s+(.*?)(?:\s+order\s+by|\s+group\s+by|\s+limit|$)', sql, re.IGNORECASE | re.DOTALL)
        group_match = re.search(r'group\s+by\s+(.*?)(?:\s+order\s+by|\s+limit|$)', sql, re.IGNORECASE | re.DOTALL)
        order_match = re.search(r'order\s+by\s+(.*?)(?:\s+limit|$)', sql, re.IGNORECASE | re.DOTALL)
        limit_match = re.search(r'limit\s+(\d+)', sql, re.IGNORECASE)
        
        result_df = df.copy()
        
        if where_match:
            where_clause = where_match.group(1).strip()
            result_df = self._apply_where(result_df, where_clause)
        
        if group_match:
            group_columns = [c.strip() for c in group_match.group(1).split(',')]
            if select_match:
                select_clause = select_match.group(1).strip()
                result_df = self._apply_aggregation(result_df, group_columns, select_clause)
        else:
            if select_match and select_match.group(1).strip() != '*':
                select_clause = select_match.group(1).strip()
                result_df = self._apply_select(result_df, select_clause)
        
        if order_match:
            order_clause = order_match.group(1).strip()
            result_df = self._apply_order(result_df, order_clause)
        
        if limit_match:
            limit = int(limit_match.group(1))
            result_df = result_df.head(limit)
        
        return result_df

    def _apply_select(self, df: pd.DataFrame, select_clause: str) -> pd.DataFrame:
        columns = [c.strip() for c in select_clause.split(',')]
        selected_columns = []
        
        for col in columns:
            col = col.strip()
            agg_match = re.match(r'(count|sum|avg|min|max)\s*\(\s*(\*|\w+)\s*\)\s+as\s+(\w+)', col, re.IGNORECASE)
            if agg_match:
                func, col_name, alias = agg_match.groups()
                func = func.lower()
                if col_name == '*':
                    df[alias] = len(df) if func == 'count' else df.iloc[:, 0].agg(func)
                else:
                    df[alias] = df[col_name].agg(func)
                selected_columns.append(alias)
            else:
                if col in df.columns:
                    selected_columns.append(col)
        
        return df[selected_columns] if selected_columns else df

    def _apply_where(self, df: pd.DataFrame, where_clause: str) -> pd.DataFrame:
        conditions = re.split(r'\s+and\s+', where_clause, flags=re.IGNORECASE)
        mask = pd.Series([True] * len(df), index=df.index)
        
        for condition in conditions:
            condition = condition.strip()
            
            eq_match = re.match(r'(\w+)\s*=\s*[\'"]?([^\'"]+)[\'"]?', condition)
            gt_match = re.match(r'(\w+)\s*>\s*([\d.]+)', condition)
            lt_match = re.match(r'(\w+)\s*<\s*([\d.]+)', condition)
            gte_match = re.match(r'(\w+)\s*>=\s*([\d.]+)', condition)
            lte_match = re.match(r'(\w+)\s*<=\s*([\d.]+)', condition)
            between_match = re.match(r'(\w+)\s+between\s+([\d.]+)\s+and\s+([\d.]+)', condition, re.IGNORECASE)
            like_match = re.match(r'(\w+)\s+like\s+[\'"]?([^\'"]+)[\'"]?', condition, re.IGNORECASE)
            in_match = re.match(r'(\w+)\s+in\s*\((.*?)\)', condition, re.IGNORECASE)
            
            if eq_match:
                col, val = eq_match.groups()
                if col in df.columns:
                    mask &= df[col].astype(str) == val
            elif gt_match:
                col, val = gt_match.groups()
                if col in df.columns:
                    mask &= df[col].astype(float) > float(val)
            elif lt_match:
                col, val = lt_match.groups()
                if col in df.columns:
                    mask &= df[col].astype(float) < float(val)
            elif gte_match:
                col, val = gte_match.groups()
                if col in df.columns:
                    mask &= df[col].astype(float) >= float(val)
            elif lte_match:
                col, val = lte_match.groups()
                if col in df.columns:
                    mask &= df[col].astype(float) <= float(val)
            elif between_match:
                col, min_val, max_val = between_match.groups()
                if col in df.columns:
                    mask &= (df[col].astype(float) >= float(min_val)) & (df[col].astype(float) <= float(max_val))
            elif like_match:
                col, pattern = like_match.groups()
                if col in df.columns:
                    pattern = pattern.replace('%', '.*').replace('_', '.')
                    mask &= df[col].astype(str).str.match(pattern, case=False, na=False)
            elif in_match:
                col, values = in_match.groups()
                if col in df.columns:
                    value_list = [v.strip().strip('\'"') for v in values.split(',')]
                    mask &= df[col].astype(str).isin(value_list)
        
        return df[mask]

    def _apply_aggregation(self, df: pd.DataFrame, group_columns: List[str], select_clause: str) -> pd.DataFrame:
        agg_dict = {}
        select_items = [s.strip() for s in select_clause.split(',')]
        
        for item in select_items:
            agg_match = re.match(r'(count|sum|avg|min|max)\s*\(\s*(\*|\w+)\s*\)\s+as\s+(\w+)', item, re.IGNORECASE)
            if agg_match:
                func, col_name, alias = agg_match.groups()
                func = func.lower()
                if col_name == '*':
                    agg_dict[alias] = ('count', 'size') if func == 'count' else (df.columns[0], func)
                else:
                    agg_dict[alias] = (col_name, func)
            elif item in group_columns:
                pass
            else:
                pass
        
        if agg_dict:
            result = df.groupby(group_columns).agg(**agg_dict).reset_index()
            return result
        
        return df.groupby(group_columns).first().reset_index()

    def _apply_order(self, df: pd.DataFrame, order_clause: str) -> pd.DataFrame:
        order_items = [o.strip() for o in order_clause.split(',')]
        sort_columns = []
        ascending = []
        
        for item in order_items:
            parts = item.split()
            col = parts[0]
            asc = True
            if len(parts) > 1 and parts[1].lower() == 'desc':
                asc = False
            if col in df.columns:
                sort_columns.append(col)
                ascending.append(asc)
        
        if sort_columns:
            return df.sort_values(by=sort_columns, ascending=ascending)
        return df

    def _execute_external_sql(self, sql: str, db_config: Optional[Dict[str, Any]]) -> pd.DataFrame:
        if not db_config:
            raise ValueError("需要提供数据库配置或使用已加载的数据集")
        
        db_type = db_config.get('db_type')
        host = db_config.get('host')
        port = db_config.get('port')
        database = db_config.get('database')
        username = db_config.get('username')
        password = db_config.get('password')
        
        if db_type == 'sqlite':
            df = pd.read_sql_query(sql, f"sqlite:///{database}")
        elif db_type == 'mysql':
            connection_str = f"mysql+mysqlconnector://{username}:{password}@{host}:{port}/{database}"
            df = pd.read_sql_query(sql, connection_str)
        elif db_type == 'postgresql':
            connection_str = f"postgresql+psycopg2://{username}:{password}@{host}:{port}/{database}"
            df = pd.read_sql_query(sql, connection_str)
        else:
            raise ValueError(f"不支持的数据库类型: {db_type}")
        
        return df

    def _explain_query(self, sql: str, result_df: pd.DataFrame) -> List[Dict[str, Any]]:
        explain_steps = []
        
        try:
            parsed = sqlglot.parse_one(sql)
            
            explain_steps.append({
                "step": "查询解析",
                "description": "SQL语句解析成功",
                "details": str(parsed),
            })
            
            if parsed.find(sqlglot.exp.Where):
                explain_steps.append({
                    "step": "WHERE过滤",
                    "description": "应用WHERE条件过滤数据",
                    "estimated_rows": "根据条件复杂度估算",
                })
            
            if parsed.find(sqlglot.exp.Group):
                explain_steps.append({
                    "step": "GROUP BY分组",
                    "description": "按指定列进行分组聚合",
                    "estimated_rows": "分组后行数减少",
                })
            
            if parsed.find(sqlglot.exp.Order):
                explain_steps.append({
                    "step": "ORDER BY排序",
                    "description": "对结果集进行排序",
                    "cost": "O(n log n)",
                })
            
            explain_steps.append({
                "step": "结果返回",
                "description": "返回最终查询结果",
                "actual_rows": len(result_df),
                "columns": list(result_df.columns),
            })
            
        except Exception as e:
            explain_steps.append({
                "step": "解析失败",
                "description": f"无法解析SQL: {str(e)}",
            })
        
        return explain_steps

    def get_query_history(self, limit: int = 20) -> List[QueryHistoryItem]:
        return self.query_history[:limit]

    def clear_history(self) -> bool:
        self.query_history.clear()
        return True

    def get_templates(self, category: Optional[str] = None) -> List[SQLTemplate]:
        if category:
            return [t for t in self.templates if t.category == category]
        return self.templates

    def create_template(self, name: str, description: str, sql: str, 
                       parameters: List[Dict[str, Any]] = None, category: str = "general") -> SQLTemplate:
        template = SQLTemplate(
            template_id=str(uuid.uuid4()),
            name=name,
            description=description,
            sql=sql,
            parameters=parameters or [],
            category=category,
            created_at=datetime.now().isoformat(),
        )
        self.templates.append(template)
        return template

    def delete_template(self, template_id: str) -> bool:
        for i, t in enumerate(self.templates):
            if t.template_id == template_id:
                self.templates.pop(i)
                return True
        return False

    def save_result_as_dataset(self, result: SQLQueryResult, name: str) -> str:
        if result.status != "success" or not result.data:
            raise ValueError("查询结果无效，无法保存为数据集")
        
        dataset_id = str(uuid.uuid4())
        df = pd.DataFrame(result.data)
        data_store[dataset_id] = df
        
        return dataset_id

    def validate_sql(self, sql: str) -> Dict[str, Any]:
        try:
            parsed = sqlglot.parse_one(sql)
            return {
                "valid": True,
                "ast": str(parsed),
                "tables": [t.name for t in parsed.find_all(sqlglot.exp.Table)],
                "columns": [c.name for c in parsed.find_all(sqlglot.exp.Column)],
            }
        except Exception as e:
            return {
                "valid": False,
                "error": str(e),
            }


sql_engine = SQLEngine()
