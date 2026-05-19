from fastapi import APIRouter, HTTPException
from typing import Dict, Any, Optional, List
from pydantic import BaseModel

from .lineage_engine import lineage_engine

router = APIRouter(prefix="/api/lineage", tags=["lineage"])


class AddDatasetLineageRequest(BaseModel):
    dataset_id: str
    name: str
    source_datasets: Optional[List[str]] = None
    transformation: Optional[str] = None
    fields: Optional[List[str]] = None
    lineage_id: str = "default"


class AddChartLineageRequest(BaseModel):
    chart_id: str
    name: str
    dataset_id: str
    fields_used: Optional[List[str]] = None
    lineage_id: str = "default"


class AddDashboardLineageRequest(BaseModel):
    dashboard_id: str
    name: str
    chart_ids: List[str]
    lineage_id: str = "default"


class ParseSQLRequest(BaseModel):
    sql: str
    target_dataset: str


@router.get("/")
async def list_lineages():
    lineages = lineage_engine.list_lineages()
    return {"lineages": lineages}


@router.post("/")
async def create_lineage():
    lineage = lineage_engine.create_lineage()
    return {"lineage_id": lineage.lineage_id if hasattr(lineage, 'lineage_id') else "default"}


@router.delete("/{lineage_id}")
async def delete_lineage(lineage_id: str):
    success = lineage_engine.delete_lineage(lineage_id)
    if not success:
        raise HTTPException(status_code=404, detail="Lineage not found")
    return {"status": "success"}


@router.get("/{lineage_id}/graph")
async def get_lineage_graph(lineage_id: str = "default"):
    graph = lineage_engine.get_full_lineage(lineage_id)
    return graph


@router.post("/dataset")
async def add_dataset_lineage(request: AddDatasetLineageRequest):
    result = lineage_engine.add_dataset_lineage(
        dataset_id=request.dataset_id,
        name=request.name,
        source_datasets=request.source_datasets,
        transformation=request.transformation,
        fields=request.fields,
        lineage_id=request.lineage_id,
    )
    return result


@router.post("/chart")
async def add_chart_lineage(request: AddChartLineageRequest):
    result = lineage_engine.add_chart_lineage(
        chart_id=request.chart_id,
        name=request.name,
        dataset_id=request.dataset_id,
        fields_used=request.fields_used,
        lineage_id=request.lineage_id,
    )
    return result


@router.post("/dashboard")
async def add_dashboard_lineage(request: AddDashboardLineageRequest):
    result = lineage_engine.add_dashboard_lineage(
        dashboard_id=request.dashboard_id,
        name=request.name,
        chart_ids=request.chart_ids,
        lineage_id=request.lineage_id,
    )
    return result


@router.get("/node/{node_id}/impact")
async def get_node_impact(node_id: str, lineage_id: str = "default"):
    try:
        impact = lineage_engine.get_node_impact(node_id, lineage_id)
        return impact
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/search")
async def search_lineage(keyword: str, lineage_id: str = "default"):
    results = lineage_engine.search_lineage(keyword, lineage_id)
    return {"results": results}


@router.post("/parse-sql")
async def parse_sql_lineage(request: ParseSQLRequest):
    lineage = lineage_engine.get_lineage("default")
    if not lineage:
        raise HTTPException(status_code=404, detail="Default lineage not found")
    
    result = lineage.parse_sql_lineage(request.sql, request.target_dataset)
    return result


@router.get("/field/{field_name}")
async def get_field_lineage(field_name: str, lineage_id: str = "default"):
    lineage = lineage_engine.get_lineage(lineage_id)
    if not lineage:
        raise HTTPException(status_code=404, detail="Lineage not found")
    
    result = lineage.get_field_lineage(field_name)
    return result
