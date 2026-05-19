from fastapi import APIRouter, HTTPException
from typing import Dict, Any, Optional, List
from pydantic import BaseModel

from .sql_engine import sql_engine, SQLQueryRequest

router = APIRouter(prefix="/api/sql", tags=["sql"])


class ExecuteSQLRequest(BaseModel):
    sql: str
    connection_id: Optional[str] = None
    database_config: Optional[Dict[str, Any]] = None
    explain: bool = False
    max_rows: int = 1000


class SaveResultRequest(BaseModel):
    query_id: str
    name: str


class CreateTemplateRequest(BaseModel):
    name: str
    description: str
    sql: str
    parameters: List[Dict[str, Any]] = []
    category: str = "general"


@router.post("/execute")
async def execute_sql(request: ExecuteSQLRequest):
    query_request = SQLQueryRequest(
        sql=request.sql,
        connection_id=request.connection_id,
        database_config=request.database_config,
        explain=request.explain,
        max_rows=request.max_rows,
    )
    
    result = sql_engine.execute_query(query_request)
    
    return {
        "query_id": result.query_id,
        "status": result.status,
        "data": result.data,
        "columns": result.columns,
        "row_count": result.row_count,
        "execution_time": result.execution_time,
        "error": result.error,
        "explain_result": result.explain_result,
    }


@router.get("/history")
async def get_query_history(limit: int = 20):
    history = sql_engine.get_query_history(limit)
    return {"history": [h.dict() for h in history]}


@router.delete("/history")
async def clear_query_history():
    sql_engine.clear_history()
    return {"status": "success", "message": "查询历史已清空"}


@router.get("/templates")
async def get_sql_templates(category: Optional[str] = None):
    templates = sql_engine.get_templates(category)
    return {"templates": [t.dict() for t in templates]}


@router.post("/templates")
async def create_sql_template(request: CreateTemplateRequest):
    template = sql_engine.create_template(
        name=request.name,
        description=request.description,
        sql=request.sql,
        parameters=request.parameters,
        category=request.category,
    )
    return {"template_id": template.template_id, "status": "success"}


@router.delete("/templates/{template_id}")
async def delete_sql_template(template_id: str):
    success = sql_engine.delete_template(template_id)
    if not success:
        raise HTTPException(status_code=404, detail="模板不存在")
    return {"status": "success", "message": "模板已删除"}


@router.post("/save-dataset")
async def save_query_result_as_dataset(request: SaveResultRequest):
    result = None
    for h in sql_engine.query_history:
        if h.query_id == request.query_id:
            from .sql_engine import SQLQueryResult
            result = SQLQueryResult(
                query_id=h.query_id,
                sql=h.sql,
                status=h.status,
                row_count=h.row_count,
                execution_time=h.execution_time,
                error=h.error,
            )
            break
    
    if not result:
        raise HTTPException(status_code=404, detail="查询记录不存在")
    
    try:
        dataset_id = sql_engine.save_result_as_dataset(result, request.name)
        return {"dataset_id": dataset_id, "status": "success"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/validate")
async def validate_sql(request: Dict[str, Any]):
    sql = request.get("sql", "")
    validation_result = sql_engine.validate_sql(sql)
    return validation_result
