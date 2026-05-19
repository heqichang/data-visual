import uuid
from datetime import datetime
from typing import Dict, List, Any, Optional, Tuple
from pydantic import BaseModel
import pandas as pd
import numpy as np


class TrendAnalysisRequest(BaseModel):
    dataset_id: str
    x_column: str
    y_column: str
    method: str = "linear_regression"
    window_size: Optional[int] = None


class AnomalyDetectionRequest(BaseModel):
    dataset_id: str
    columns: List[str]
    method: str = "zscore"
    threshold: float = 3.0


class ForecastRequest(BaseModel):
    dataset_id: str
    date_column: str
    value_column: str
    periods: int = 30
    method: str = "prophet"


class ClusteringRequest(BaseModel):
    dataset_id: str
    columns: List[str]
    method: str = "kmeans"
    n_clusters: int = 3


class CorrelationRequest(BaseModel):
    dataset_id: str
    columns: List[str]
    method: str = "pearson"


class AnalyticsEngine:
    def __init__(self):
        self.analysis_results: Dict[str, Dict[str, Any]] = {}

    def linear_regression(self, x: np.ndarray, y: np.ndarray) -> Dict[str, Any]:
        from sklearn.linear_model import LinearRegression
        
        x_reshaped = x.reshape(-1, 1)
        model = LinearRegression()
        model.fit(x_reshaped, y)
        
        slope = float(model.coef_[0])
        intercept = float(model.intercept_)
        r_squared = float(model.score(x_reshaped, y))
        
        x_min, x_max = x.min(), x.max()
        x_line = np.array([x_min, x_max]).reshape(-1, 1)
        y_line = model.predict(x_line)
        
        return {
            "slope": slope,
            "intercept": intercept,
            "r_squared": r_squared,
            "line_points": [
                {"x": float(x_line[0][0]), "y": float(y_line[0])},
                {"x": float(x_line[1][0]), "y": float(y_line[1])},
            ],
            "equation": f"y = {slope:.4f}x + {intercept:.4f}",
        }

    def moving_average(self, y: np.ndarray, window_size: int) -> Dict[str, Any]:
        weights = np.repeat(1.0, window_size) / window_size
        ma = np.convolve(y, weights, 'valid')
        
        pad_width = len(y) - len(ma)
        ma_padded = np.pad(ma, (pad_width, 0), mode='constant', constant_values=np.nan)
        
        return {
            "window_size": window_size,
            "values": [float(v) if not np.isnan(v) else None for v in ma_padded],
        }

    def trend_analysis(self, request: TrendAnalysisRequest) -> Dict[str, Any]:
        from main import data_store
        
        if request.dataset_id not in data_store:
            raise ValueError("Dataset not found")
        
        df = data_store[request.dataset_id]
        
        if request.x_column not in df.columns or request.y_column not in df.columns:
            raise ValueError("指定的列不存在")
        
        x_series = pd.to_numeric(df[request.x_column], errors='coerce').dropna()
        y_series = pd.to_numeric(df[request.y_column], errors='coerce').dropna()
        
        common_indices = x_series.index.intersection(y_series.index)
        x = x_series[common_indices].values
        y = y_series[common_indices].values
        
        if len(x) < 2:
            raise ValueError("数据点不足，无法进行趋势分析")
        
        result = {
            "method": request.method,
            "x_column": request.x_column,
            "y_column": request.y_column,
            "data_points": [
                {"x": float(x[i]), "y": float(y[i])} 
                for i in range(len(x))
            ],
        }
        
        if request.method == "linear_regression":
            lr_result = self.linear_regression(x, y)
            result.update(lr_result)
        elif request.method == "moving_average":
            window_size = request.window_size or max(3, len(x) // 10)
            ma_result = self.moving_average(y, window_size)
            result.update(ma_result)
        
        analysis_id = str(uuid.uuid4())
        self.analysis_results[analysis_id] = result
        
        return {
            "analysis_id": analysis_id,
            "result": result,
        }

    def zscore_anomaly_detection(self, data: np.ndarray, threshold: float) -> Dict[str, Any]:
        mean = np.mean(data)
        std = np.std(data)
        
        if std == 0:
            return {"anomalies": [], "mean": float(mean), "std": 0.0}
        
        z_scores = (data - mean) / std
        anomaly_indices = np.where(np.abs(z_scores) > threshold)[0]
        
        return {
            "anomalies": [int(i) for i in anomaly_indices],
            "mean": float(mean),
            "std": float(std),
            "threshold": threshold,
            "z_scores": [float(z) for z in z_scores],
        }

    def iqr_anomaly_detection(self, data: np.ndarray) -> Dict[str, Any]:
        q1 = np.percentile(data, 25)
        q3 = np.percentile(data, 75)
        iqr = q3 - q1
        
        lower_bound = q1 - 1.5 * iqr
        upper_bound = q3 + 1.5 * iqr
        
        anomaly_indices = np.where((data < lower_bound) | (data > upper_bound))[0]
        
        return {
            "anomalies": [int(i) for i in anomaly_indices],
            "q1": float(q1),
            "q3": float(q3),
            "iqr": float(iqr),
            "lower_bound": float(lower_bound),
            "upper_bound": float(upper_bound),
        }

    def isolation_forest_anomaly_detection(self, data: np.ndarray, contamination: float = 0.1) -> Dict[str, Any]:
        try:
            from sklearn.ensemble import IsolationForest
            
            data_reshaped = data.reshape(-1, 1)
            model = IsolationForest(contamination=contamination, random_state=42)
            predictions = model.fit_predict(data_reshaped)
            
            anomaly_indices = np.where(predictions == -1)[0]
            
            return {
                "anomalies": [int(i) for i in anomaly_indices],
                "contamination": contamination,
            }
        except ImportError:
            return self.zscore_anomaly_detection(data, 3.0)

    def anomaly_detection(self, request: AnomalyDetectionRequest) -> Dict[str, Any]:
        from main import data_store
        
        if request.dataset_id not in data_store:
            raise ValueError("Dataset not found")
        
        df = data_store[request.dataset_id]
        
        results = {}
        for column in request.columns:
            if column not in df.columns:
                continue
            
            series = pd.to_numeric(df[column], errors='coerce').dropna()
            if len(series) == 0:
                continue
            
            data = series.values
            
            if request.method == "zscore":
                result = self.zscore_anomaly_detection(data, request.threshold)
            elif request.method == "iqr":
                result = self.iqr_anomaly_detection(data)
            elif request.method == "isolation_forest":
                result = self.isolation_forest_anomaly_detection(data)
            else:
                result = self.zscore_anomaly_detection(data, request.threshold)
            
            result["values"] = [float(v) for v in data]
            results[column] = result
        
        analysis_id = str(uuid.uuid4())
        self.analysis_results[analysis_id] = results
        
        return {
            "analysis_id": analysis_id,
            "method": request.method,
            "results": results,
        }

    def arima_forecast(self, dates: np.ndarray, values: np.ndarray, periods: int) -> Dict[str, Any]:
        try:
            from statsmodels.tsa.arima.model import ARIMA
            
            series = pd.Series(values, index=pd.to_datetime(dates))
            series = series.asfreq('D').ffill()
            
            model = ARIMA(series, order=(1, 1, 1))
            model_fit = model.fit()
            
            forecast = model_fit.forecast(steps=periods)
            
            return {
                "forecast": [float(v) for v in forecast.values],
                "forecast_dates": [d.isoformat() for d in forecast.index],
                "aic": float(model_fit.aic),
                "bic": float(model_fit.bic),
            }
        except ImportError:
            return self.simple_moving_average_forecast(values, periods)

    def simple_moving_average_forecast(self, values: np.ndarray, periods: int) -> Dict[str, Any]:
        last_value = values[-1] if len(values) > 0 else 0
        trend = np.mean(np.diff(values[-10:])) if len(values) > 10 else 0
        
        forecast = []
        current = last_value
        for i in range(periods):
            current += trend
            forecast.append(float(current))
        
        return {
            "forecast": forecast,
            "method": "simple_moving_average",
        }

    def prophet_forecast(self, dates: np.ndarray, values: np.ndarray, periods: int) -> Dict[str, Any]:
        try:
            from prophet import Prophet
            
            df = pd.DataFrame({
                'ds': pd.to_datetime(dates),
                'y': values,
            })
            
            model = Prophet()
            model.fit(df)
            
            future = model.make_future_dataframe(periods=periods)
            forecast = model.predict(future)
            
            forecast_values = forecast['yhat'].tail(periods).values
            forecast_dates = forecast['ds'].tail(periods).dt.isoformat().values
            
            return {
                "forecast": [float(v) for v in forecast_values],
                "forecast_dates": [d for d in forecast_dates],
                "lower_bounds": [float(v) for v in forecast['yhat_lower'].tail(periods).values],
                "upper_bounds": [float(v) for v in forecast['yhat_upper'].tail(periods).values],
            }
        except ImportError:
            return self.simple_moving_average_forecast(values, periods)

    def forecast(self, request: ForecastRequest) -> Dict[str, Any]:
        from main import data_store
        
        if request.dataset_id not in data_store:
            raise ValueError("Dataset not found")
        
        df = data_store[request.dataset_id]
        
        if request.date_column not in df.columns or request.value_column not in df.columns:
            raise ValueError("指定的列不存在")
        
        dates = pd.to_datetime(df[request.date_column], errors='coerce').dropna()
        values = pd.to_numeric(df[request.value_column], errors='coerce').dropna()
        
        common_indices = dates.index.intersection(values.index)
        dates = dates[common_indices]
        values = values[common_indices]
        
        if len(dates) < 5:
            raise ValueError("数据点不足，无法进行预测")
        
        sorted_indices = dates.argsort()
        dates = dates.iloc[sorted_indices].values
        values = values.iloc[sorted_indices].values
        
        if request.method == "prophet":
            result = self.prophet_forecast(dates, values, request.periods)
        elif request.method == "arima":
            result = self.arima_forecast(dates, values, request.periods)
        else:
            result = self.simple_moving_average_forecast(values, request.periods)
        
        analysis_id = str(uuid.uuid4())
        self.analysis_results[analysis_id] = result
        
        return {
            "analysis_id": analysis_id,
            "method": request.method,
            "periods": request.periods,
            "historical": {
                "dates": [d.isoformat() if hasattr(d, 'isoformat') else str(d) for d in dates],
                "values": [float(v) for v in values],
            },
            "forecast": result,
        }

    def kmeans_clustering(self, data: np.ndarray, n_clusters: int) -> Dict[str, Any]:
        from sklearn.cluster import KMeans
        
        model = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
        labels = model.fit_predict(data)
        
        return {
            "labels": [int(l) for l in labels],
            "centers": [[float(c) for c in center] for center in model.cluster_centers_],
            "inertia": float(model.inertia_),
        }

    def dbscan_clustering(self, data: np.ndarray, eps: float = 0.5, min_samples: int = 5) -> Dict[str, Any]:
        try:
            from sklearn.cluster import DBSCAN
            
            model = DBSCAN(eps=eps, min_samples=min_samples)
            labels = model.fit_predict(data)
            
            return {
                "labels": [int(l) for l in labels],
                "n_clusters": len(set(labels)) - (1 if -1 in labels else 0),
                "n_noise": int((labels == -1).sum()),
            }
        except ImportError:
            return self.kmeans_clustering(data, 3)

    def clustering(self, request: ClusteringRequest) -> Dict[str, Any]:
        from main import data_store
        
        if request.dataset_id not in data_store:
            raise ValueError("Dataset not found")
        
        df = data_store[request.dataset_id]
        
        data_columns = []
        for column in request.columns:
            if column in df.columns:
                series = pd.to_numeric(df[column], errors='coerce')
                data_columns.append(series)
        
        if len(data_columns) < 1:
            raise ValueError("没有有效的数值列用于聚类")
        
        data_df = pd.concat(data_columns, axis=1).dropna()
        data = data_df.values
        
        if len(data) < request.n_clusters:
            raise ValueError("数据点不足，无法进行聚类")
        
        if request.method == "kmeans":
            result = self.kmeans_clustering(data, request.n_clusters)
        elif request.method == "dbscan":
            result = self.dbscan_clustering(data)
        else:
            result = self.kmeans_clustering(data, request.n_clusters)
        
        result["data"] = [[float(v) for v in row] for row in data]
        result["columns"] = request.columns
        
        analysis_id = str(uuid.uuid4())
        self.analysis_results[analysis_id] = result
        
        return {
            "analysis_id": analysis_id,
            "method": request.method,
            "n_clusters": request.n_clusters,
            "result": result,
        }

    def correlation_analysis(self, request: CorrelationRequest) -> Dict[str, Any]:
        from main import data_store
        
        if request.dataset_id not in data_store:
            raise ValueError("Dataset not found")
        
        df = data_store[request.dataset_id]
        
        valid_columns = [col for col in request.columns if col in df.columns]
        
        data_df = df[valid_columns].apply(pd.to_numeric, errors='coerce').dropna()
        
        if len(valid_columns) < 2:
            raise ValueError("至少需要两列才能进行相关性分析")
        
        if request.method == "pearson":
            corr_matrix = data_df.corr(method='pearson')
        elif request.method == "spearman":
            corr_matrix = data_df.corr(method='spearman')
        else:
            corr_matrix = data_df.corr(method='pearson')
        
        result = {
            "method": request.method,
            "columns": valid_columns,
            "matrix": [[float(v) if not pd.isna(v) else 0 for v in row] for row in corr_matrix.values],
            "pairs": [],
        }
        
        for i in range(len(valid_columns)):
            for j in range(i + 1, len(valid_columns)):
                result["pairs"].append({
                    "column1": valid_columns[i],
                    "column2": valid_columns[j],
                    "correlation": float(corr_matrix.iloc[i, j]) if not pd.isna(corr_matrix.iloc[i, j]) else 0,
                })
        
        analysis_id = str(uuid.uuid4())
        self.analysis_results[analysis_id] = result
        
        return {
            "analysis_id": analysis_id,
            "result": result,
        }

    def get_analysis_result(self, analysis_id: str) -> Optional[Dict[str, Any]]:
        return self.analysis_results.get(analysis_id)


analytics_engine = AnalyticsEngine()
