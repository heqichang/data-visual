import pandas as pd
import numpy as np
from typing import List, Dict, Any, Optional, Callable
from collections import deque
import re
import operator


class PipelineNode:
    def __init__(self, node_id: str, node_type: str, config: Dict[str, Any] = None, enabled: bool = True):
        self.id = node_id
        self.type = node_type
        self.config = config or {}
        self.enabled = enabled
        self.inputs: List[str] = []
        self.outputs: List[str] = []


class PipelineDAG:
    def __init__(self):
        self.nodes: Dict[str, PipelineNode] = {}
        self.edges: List[tuple] = []
    
    def add_node(self, node: PipelineNode):
        self.nodes[node.id] = node
    
    def remove_node(self, node_id: str):
        if node_id in self.nodes:
            del self.nodes[node_id]
            self.edges = [(s, t) for s, t in self.edges if s != node_id and t != node_id]
    
    def add_edge(self, source_id: str, target_id: str):
        if source_id in self.nodes and target_id in self.nodes:
            self.edges.append((source_id, target_id))
            if source_id not in self.nodes[target_id].inputs:
                self.nodes[target_id].inputs.append(source_id)
            if target_id not in self.nodes[source_id].outputs:
                self.nodes[source_id].outputs.append(target_id)
    
    def remove_edge(self, source_id: str, target_id: str):
        self.edges = [(s, t) for s, t in self.edges if not (s == source_id and t == target_id)]
        if source_id in self.nodes.get(target_id, PipelineNode('', '')).inputs:
            self.nodes[target_id].inputs.remove(source_id)
        if target_id in self.nodes.get(source_id, PipelineNode('', '')).outputs:
            self.nodes[source_id].outputs.remove(target_id)
    
    def topological_sort(self) -> List[str]:
        in_degree = {node_id: len(node.inputs) for node_id, node in self.nodes.items()}
        queue = deque([node_id for node_id, deg in in_degree.items() if deg == 0])
        result = []
        
        while queue:
            node_id = queue.popleft()
            result.append(node_id)
            for target_id in self.nodes[node_id].outputs:
                in_degree[target_id] -= 1
                if in_degree[target_id] == 0:
                    queue.append(target_id)
        
        if len(result) != len(self.nodes):
            raise ValueError("Pipeline contains cycles")
        
        return result


class TransformOperations:
    @staticmethod
    def filter_rows(df: pd.DataFrame, config: Dict[str, Any]) -> pd.DataFrame:
        conditions = config.get('conditions', [])
        if not conditions:
            return df
        
        result_df = df.copy()
        for cond in conditions:
            column = cond.get('column')
            operator_str = cond.get('operator', '==')
            value = cond.get('value')
            
            if column not in result_df.columns:
                continue
            
            op_map = {
                '==': operator.eq,
                '!=': operator.ne,
                '>': operator.gt,
                '>=': operator.ge,
                '<': operator.lt,
                '<=': operator.le,
                'contains': lambda x, v: x.astype(str).str.contains(str(v), case=False, na=False),
                'not_contains': lambda x, v: ~x.astype(str).str.contains(str(v), case=False, na=False),
                'in': lambda x, v: x.isin(v) if isinstance(v, list) else x == v,
                'not_in': lambda x, v: ~x.isin(v) if isinstance(v, list) else x != v,
                'is_null': lambda x, v: x.isnull(),
                'is_not_null': lambda x, v: x.notnull(),
            }
            
            op = op_map.get(operator_str)
            if op:
                try:
                    mask = op(result_df[column], value)
                    result_df = result_df[mask]
                except Exception as e:
                    print(f"Filter error: {e}")
                    continue
        
        return result_df
    
    @staticmethod
    def select_columns(df: pd.DataFrame, config: Dict[str, Any]) -> pd.DataFrame:
        columns = config.get('columns', [])
        if not columns:
            return df
        existing_cols = [col for col in columns if col in df.columns]
        return df[existing_cols].copy()
    
    @staticmethod
    def sort(df: pd.DataFrame, config: Dict[str, Any]) -> pd.DataFrame:
        sort_columns = config.get('columns', [])
        ascending = config.get('ascending', True)
        
        if not sort_columns:
            return df
        
        valid_cols = [col for col in sort_columns if col in df.columns]
        if not valid_cols:
            return df
        
        if isinstance(ascending, list):
            asc = ascending[:len(valid_cols)]
        else:
            asc = [ascending] * len(valid_cols)
        
        return df.sort_values(by=valid_cols, ascending=asc).copy()
    
    @staticmethod
    def group_aggregate(df: pd.DataFrame, config: Dict[str, Any]) -> pd.DataFrame:
        group_cols = config.get('group_columns', [])
        aggregations = config.get('aggregations', [])
        
        if not group_cols or not aggregations:
            return df
        
        valid_group_cols = [col for col in group_cols if col in df.columns]
        if not valid_group_cols:
            return df
        
        agg_dict = {}
        for agg in aggregations:
            col = agg.get('column')
            func = agg.get('function', 'sum')
            alias = agg.get('alias', f"{func}_{col}")
            
            if col not in df.columns:
                continue
            
            func_map = {
                'sum': 'sum',
                'avg': 'mean',
                'count': 'count',
                'max': 'max',
                'min': 'min',
                'median': 'median',
                'std': 'std',
                'var': 'var',
                'first': 'first',
                'last': 'last',
            }
            
            if func in func_map:
                agg_dict[col] = func_map[func]
        
        if not agg_dict:
            return df
        
        result = df.groupby(valid_group_cols).agg(agg_dict).reset_index()
        
        col_mapping = {}
        for agg in aggregations:
            col = agg.get('column')
            alias = agg.get('alias', f"{agg.get('function', 'sum')}_{col}")
            if col in result.columns and col != alias:
                col_mapping[col] = alias
        
        if col_mapping:
            result = result.rename(columns=col_mapping)
        
        return result
    
    @staticmethod
    def pivot_table(df: pd.DataFrame, config: Dict[str, Any]) -> pd.DataFrame:
        index_cols = config.get('rows', [])
        columns_cols = config.get('columns', [])
        values_cols = config.get('values', [])
        agg_func = config.get('agg_func', 'sum')
        fill_value = config.get('fill_value', None)
        
        if not index_cols or not values_cols:
            return df
        
        valid_index = [col for col in index_cols if col in df.columns]
        valid_columns = [col for col in columns_cols if col in df.columns]
        valid_values = [col for col in values_cols if col in df.columns]
        
        if not valid_index or not valid_values:
            return df
        
        try:
            pivot = pd.pivot_table(
                df,
                index=valid_index,
                columns=valid_columns if valid_columns else None,
                values=valid_values,
                aggfunc=agg_func,
                fill_value=fill_value
            )
            pivot = pivot.reset_index()
            
            if isinstance(pivot.columns, pd.MultiIndex):
                pivot.columns = ['_'.join(col).strip() if isinstance(col, tuple) else col for col in pivot.columns]
            
            return pivot
        except Exception as e:
            print(f"Pivot error: {e}")
            return df
    
    @staticmethod
    def compute_column(df: pd.DataFrame, config: Dict[str, Any]) -> pd.DataFrame:
        new_column = config.get('new_column', '')
        expression = config.get('expression', '')
        
        if not new_column or not expression:
            return df
        
        result_df = df.copy()
        
        try:
            safe_dict = {
                'pd': pd,
                'np': np,
                'df': result_df,
            }
            
            for col in result_df.columns:
                safe_dict[col] = result_df[col]
            
            result = eval(expression, {"__builtins__": {}}, safe_dict)
            result_df[new_column] = result
        except Exception as e:
            print(f"Compute column error: {e}")
        
        return result_df
    
    @staticmethod
    def join(dfs: List[pd.DataFrame], config: Dict[str, Any]) -> pd.DataFrame:
        if len(dfs) < 2:
            return dfs[0] if dfs else pd.DataFrame()
        
        how = config.get('how', 'inner')
        left_on = config.get('left_on', [])
        right_on = config.get('right_on', [])
        
        if not left_on or not right_on:
            return dfs[0]
        
        try:
            result = dfs[0].merge(dfs[1], how=how, left_on=left_on, right_on=right_on)
            return result
        except Exception as e:
            print(f"Join error: {e}")
            return dfs[0]
    
    @staticmethod
    def union(dfs: List[pd.DataFrame], config: Dict[str, Any]) -> pd.DataFrame:
        if len(dfs) < 2:
            return dfs[0] if dfs else pd.DataFrame()
        
        ignore_index = config.get('ignore_index', True)
        
        try:
            result = pd.concat(dfs, ignore_index=ignore_index)
            return result
        except Exception as e:
            print(f"Union error: {e}")
            return dfs[0]
    
    @staticmethod
    def drop_duplicates(df: pd.DataFrame, config: Dict[str, Any]) -> pd.DataFrame:
        subset = config.get('subset', None)
        keep = config.get('keep', 'first')
        
        try:
            return df.drop_duplicates(subset=subset, keep=keep).copy()
        except Exception as e:
            print(f"Drop duplicates error: {e}")
            return df
    
    @staticmethod
    def fill_nulls(df: pd.DataFrame, config: Dict[str, Any]) -> pd.DataFrame:
        strategy = config.get('strategy', 'value')
        value = config.get('value', None)
        columns = config.get('columns', None)
        
        result_df = df.copy()
        
        if columns:
            target_cols = [col for col in columns if col in result_df.columns]
        else:
            target_cols = result_df.columns.tolist()
        
        try:
            if strategy == 'value':
                result_df[target_cols] = result_df[target_cols].fillna(value)
            elif strategy == 'mean':
                for col in target_cols:
                    if pd.api.types.is_numeric_dtype(result_df[col]):
                        result_df[col] = result_df[col].fillna(result_df[col].mean())
            elif strategy == 'median':
                for col in target_cols:
                    if pd.api.types.is_numeric_dtype(result_df[col]):
                        result_df[col] = result_df[col].fillna(result_df[col].median())
            elif strategy == 'mode':
                for col in target_cols:
                    mode_val = result_df[col].mode()
                    if not mode_val.empty:
                        result_df[col] = result_df[col].fillna(mode_val.iloc[0])
            elif strategy == 'ffill':
                result_df[target_cols] = result_df[target_cols].ffill()
            elif strategy == 'bfill':
                result_df[target_cols] = result_df[target_cols].bfill()
        except Exception as e:
            print(f"Fill nulls error: {e}")
        
        return result_df
    
    @staticmethod
    def cast_type(df: pd.DataFrame, config: Dict[str, Any]) -> pd.DataFrame:
        column = config.get('column', '')
        dtype = config.get('dtype', '')
        
        if not column or column not in df.columns:
            return df
        
        result_df = df.copy()
        
        try:
            if dtype == 'int':
                result_df[column] = pd.to_numeric(result_df[column], errors='coerce').astype('Int64')
            elif dtype == 'float':
                result_df[column] = pd.to_numeric(result_df[column], errors='coerce')
            elif dtype == 'string':
                result_df[column] = result_df[column].astype(str)
            elif dtype == 'date':
                result_df[column] = pd.to_datetime(result_df[column], errors='coerce')
            elif dtype == 'boolean':
                result_df[column] = result_df[column].astype(bool)
        except Exception as e:
            print(f"Cast type error: {e}")
        
        return result_df
    
    @staticmethod
    def rank(df: pd.DataFrame, config: Dict[str, Any]) -> pd.DataFrame:
        column = config.get('column', '')
        rank_column = config.get('rank_column', 'rank')
        ascending = config.get('ascending', True)
        method = config.get('method', 'average')
        group_by = config.get('group_by', [])
        
        if not column or column not in df.columns:
            return df
        
        result_df = df.copy()
        
        try:
            if group_by:
                valid_group = [col for col in group_by if col in result_df.columns]
                if valid_group:
                    result_df[rank_column] = result_df.groupby(valid_group)[column].rank(
                        ascending=ascending, method=method
                    )
                else:
                    result_df[rank_column] = result_df[column].rank(ascending=ascending, method=method)
            else:
                result_df[rank_column] = result_df[column].rank(ascending=ascending, method=method)
        except Exception as e:
            print(f"Rank error: {e}")
        
        return result_df
    
    @staticmethod
    def moving_average(df: pd.DataFrame, config: Dict[str, Any]) -> pd.DataFrame:
        column = config.get('column', '')
        window = config.get('window', 5)
        ma_column = config.get('ma_column', None)
        group_by = config.get('group_by', [])
        
        if not column or column not in df.columns:
            return df
        
        result_df = df.copy()
        output_col = ma_column or f"{column}_ma_{window}"
        
        try:
            if group_by:
                valid_group = [col for col in group_by if col in result_df.columns]
                if valid_group:
                    result_df[output_col] = result_df.groupby(valid_group)[column].rolling(window=window).mean().reset_index(0, drop=True)
                else:
                    result_df[output_col] = result_df[column].rolling(window=window).mean()
            else:
                result_df[output_col] = result_df[column].rolling(window=window).mean()
        except Exception as e:
            print(f"Moving average error: {e}")
        
        return result_df
    
    @staticmethod
    def cumulative_sum(df: pd.DataFrame, config: Dict[str, Any]) -> pd.DataFrame:
        column = config.get('column', '')
        cumsum_column = config.get('cumsum_column', None)
        group_by = config.get('group_by', [])
        
        if not column or column not in df.columns:
            return df
        
        result_df = df.copy()
        output_col = cumsum_column or f"{column}_cumsum"
        
        try:
            if group_by:
                valid_group = [col for col in group_by if col in result_df.columns]
                if valid_group:
                    result_df[output_col] = result_df.groupby(valid_group)[column].cumsum()
                else:
                    result_df[output_col] = result_df[column].cumsum()
            else:
                result_df[output_col] = result_df[column].cumsum()
        except Exception as e:
            print(f"Cumulative sum error: {e}")
        
        return result_df


class PipelineExecutor:
    def __init__(self):
        self.operations = TransformOperations()
    
    def execute_node(self, node: PipelineNode, inputs: List[pd.DataFrame]) -> pd.DataFrame:
        if not node.enabled:
            return inputs[0] if inputs else pd.DataFrame()
        
        op_map = {
            'filter': self.operations.filter_rows,
            'select_columns': self.operations.select_columns,
            'sort': self.operations.sort,
            'group_aggregate': self.operations.group_aggregate,
            'pivot': self.operations.pivot_table,
            'compute_column': self.operations.compute_column,
            'join': self.operations.join,
            'union': self.operations.union,
            'drop_duplicates': self.operations.drop_duplicates,
            'fill_nulls': self.operations.fill_nulls,
            'cast_type': self.operations.cast_type,
            'rank': self.operations.rank,
            'moving_average': self.operations.moving_average,
            'cumulative_sum': self.operations.cumulative_sum,
        }
        
        op = op_map.get(node.type)
        if op:
            try:
                if node.type in ['join', 'union']:
                    return op(inputs, node.config)
                else:
                    return op(inputs[0], node.config) if inputs else pd.DataFrame()
            except Exception as e:
                print(f"Node execution error: {e}")
                return inputs[0] if inputs else pd.DataFrame()
        
        return inputs[0] if inputs else pd.DataFrame()
    
    def execute_pipeline(self, dag: PipelineDAG, input_data: Dict[str, pd.DataFrame]) -> Dict[str, pd.DataFrame]:
        execution_order = dag.topological_sort()
        results: Dict[str, pd.DataFrame] = {}
        
        for node_id in execution_order:
            node = dag.nodes[node_id]
            
            inputs = []
            for input_id in node.inputs:
                if input_id in results:
                    inputs.append(results[input_id])
                elif input_id in input_data:
                    inputs.append(input_data[input_id])
            
            if not inputs and node_id not in input_data:
                continue
            
            if node_id in input_data and not inputs:
                results[node_id] = input_data[node_id]
            else:
                results[node_id] = self.execute_node(node, inputs)
        
        return results
    
    def execute_with_preview(self, dag: PipelineDAG, input_data: Dict[str, pd.DataFrame], 
                            preview_rows: int = 100) -> Dict[str, Any]:
        execution_order = dag.topological_sort()
        results: Dict[str, pd.DataFrame] = {}
        previews: Dict[str, Any] = {}
        
        for node_id in execution_order:
            node = dag.nodes[node_id]
            
            inputs = []
            for input_id in node.inputs:
                if input_id in results:
                    inputs.append(results[input_id])
                elif input_id in input_data:
                    inputs.append(input_data[input_id])
            
            if not inputs and node_id not in input_data:
                continue
            
            if node_id in input_data and not inputs:
                results[node_id] = input_data[node_id]
            else:
                results[node_id] = self.execute_node(node, inputs)
            
            df = results[node_id]
            previews[node_id] = {
                'rows': int(len(df)),
                'columns': int(len(df.columns)),
                'column_names': list(df.columns),
                'preview': self._df_to_records(df.head(preview_rows)),
                'enabled': node.enabled,
                'type': node.type,
            }
        
        return {
            'results': results,
            'previews': previews,
            'execution_order': execution_order,
        }
    
    def _df_to_records(self, df: pd.DataFrame) -> List[Dict]:
        result = []
        for _, row in df.iterrows():
            record = {}
            for col in df.columns:
                val = row[col]
                if pd.isna(val):
                    record[col] = None
                elif isinstance(val, (np.integer,)):
                    record[col] = int(val)
                elif isinstance(val, (np.floating,)):
                    record[col] = float(val) if not np.isinf(val) else None
                elif isinstance(val, pd.Timestamp):
                    record[col] = val.isoformat()
                else:
                    record[col] = val
            result.append(record)
        return result
