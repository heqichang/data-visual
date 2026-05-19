from fastapi import APIRouter, HTTPException
from typing import Dict, Any, Optional, List
from pydantic import BaseModel

from .analytics_engine import (
    analytics_engine,
    TrendAnalysisRequest,
    AnomalyDetectionRequest,
    ForecastRequest,
    ClusteringRequest,
    CorrelationRequest,
)

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.post("/trend")
async def trend_analysis(request: TrendAnalysisRequest):
    try:
        result = analytics_engine.trend_analysis(request)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/anomaly")
async def anomaly_detection(request: AnomalyDetectionRequest):
    try:
        result = analytics_engine.anomaly_detection(request)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/forecast")
async def forecast(request: ForecastRequest):
    try:
        result = analytics_engine.forecast(request)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/clustering")
async def clustering(request: ClusteringRequest):
    try:
        result = analytics_engine.clustering(request)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/correlation")
async def correlation_analysis(request: CorrelationRequest):
    try:
        result = analytics_engine.correlation_analysis(request)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/results/{analysis_id}")
async def get_analysis_result(analysis_id: str):
    result = analytics_engine.get_analysis_result(analysis_id)
    if not result:
        raise HTTPException(status_code=404, detail="分析结果不存在")
    return {"result": result}
