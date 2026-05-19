from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from typing import Dict, Any, Optional, List
from pydantic import BaseModel
import asyncio

from .alert_engine import alert_engine

router = APIRouter(prefix="/api/alerts", tags=["alerts"])

active_alert_websockets: List[WebSocket] = []


class CreateAlertRuleRequest(BaseModel):
    name: str
    description: str
    dataset_id: Optional[str] = None
    stream_id: Optional[str] = None
    conditions: List[Dict[str, Any]]
    logic_operator: str = "AND"
    level: str = "warning"
    channels: List[Dict[str, Any]] = []
    silent_period: int = 300


class UpdateAlertRuleRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    conditions: Optional[List[Dict[str, Any]]] = None
    logic_operator: Optional[str] = None
    level: Optional[str] = None
    channels: Optional[List[Dict[str, Any]]] = None
    silent_period: Optional[int] = None
    is_active: Optional[bool] = None


class AcknowledgeAlertRequest(BaseModel):
    user_id: str
    user_name: str


@router.post("/rules")
async def create_alert_rule(request: CreateAlertRuleRequest):
    rule = alert_engine.create_rule(
        name=request.name,
        description=request.description,
        conditions=request.conditions,
        dataset_id=request.dataset_id,
        stream_id=request.stream_id,
        logic_operator=request.logic_operator,
        level=request.level,
        channels=request.channels,
        silent_period=request.silent_period,
    )
    return {"rule_id": rule.rule_id, "status": "success"}


@router.get("/rules")
async def list_alert_rules(
    dataset_id: Optional[str] = None,
    stream_id: Optional[str] = None,
    level: Optional[str] = None,
    is_active: Optional[bool] = None,
):
    rules = alert_engine.list_rules(
        dataset_id=dataset_id,
        stream_id=stream_id,
        level=level,
        is_active=is_active,
    )
    return {"rules": [r.dict() for r in rules]}


@router.get("/rules/{rule_id}")
async def get_alert_rule(rule_id: str):
    rule = alert_engine.get_rule(rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="告警规则不存在")
    return rule.dict()


@router.put("/rules/{rule_id}")
async def update_alert_rule(rule_id: str, request: UpdateAlertRuleRequest):
    rule = alert_engine.update_rule(
        rule_id=rule_id,
        **{k: v for k, v in request.dict().items() if v is not None},
    )
    if not rule:
        raise HTTPException(status_code=404, detail="告警规则不存在")
    return {"status": "success", "rule": rule.dict()}


@router.delete("/rules/{rule_id}")
async def delete_alert_rule(rule_id: str):
    success = alert_engine.delete_rule(rule_id)
    if not success:
        raise HTTPException(status_code=404, detail="告警规则不存在")
    return {"status": "success", "message": "告警规则已删除"}


@router.post("/rules/{rule_id}/toggle")
async def toggle_alert_rule(rule_id: str, request: Dict[str, bool]):
    is_active = request.get("is_active", True)
    rule = alert_engine.toggle_rule(rule_id, is_active)
    if not rule:
        raise HTTPException(status_code=404, detail="告警规则不存在")
    return {"status": "success", "is_active": rule.is_active}


@router.post("/rules/check")
async def check_alert_rules(dataset_id: Optional[str] = None, stream_id: Optional[str] = None):
    await alert_engine.check_rules(dataset_id=dataset_id, stream_id=stream_id)
    return {"status": "success", "message": "告警规则检查完成"}


@router.get("/records")
async def get_alert_records(
    rule_id: Optional[str] = None,
    level: Optional[str] = None,
    acknowledged: Optional[bool] = None,
    resolved: Optional[bool] = None,
    limit: int = 100,
):
    alerts = alert_engine.get_alerts(
        rule_id=rule_id,
        level=level,
        acknowledged=acknowledged,
        resolved=resolved,
        limit=limit,
    )
    return {"alerts": [a.dict() for a in alerts]}


@router.get("/records/{alert_id}")
async def get_alert_record(alert_id: str):
    alert = alert_engine.get_alert(alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="告警记录不存在")
    return alert.dict()


@router.post("/records/{alert_id}/acknowledge")
async def acknowledge_alert(alert_id: str, request: AcknowledgeAlertRequest):
    alert = alert_engine.acknowledge_alert(
        alert_id=alert_id,
        user_id=request.user_id,
        user_name=request.user_name,
    )
    if not alert:
        raise HTTPException(status_code=404, detail="告警记录不存在")
    return {"status": "success", "alert": alert.dict()}


@router.post("/records/{alert_id}/resolve")
async def resolve_alert(alert_id: str):
    alert = alert_engine.resolve_alert(alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="告警记录不存在")
    return {"status": "success", "alert": alert.dict()}


@router.get("/stats")
async def get_alert_stats(hours: int = 24):
    stats = alert_engine.get_alert_stats(hours=hours)
    return stats


@router.websocket("/ws")
async def alert_websocket(websocket: WebSocket):
    await websocket.accept()
    active_alert_websockets.append(websocket)
    
    async def alert_callback(alert):
        try:
            await websocket.send_json({
                "type": "new_alert",
                "alert": alert.dict(),
            })
        except Exception:
            pass
    
    alert_engine.add_subscriber(alert_callback)
    
    try:
        while True:
            data = await websocket.receive_json()
            if data.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        alert_engine.remove_subscriber(alert_callback)
        if websocket in active_alert_websockets:
            active_alert_websockets.remove(websocket)
    except Exception as e:
        alert_engine.remove_subscriber(alert_callback)
        if websocket in active_alert_websockets:
            active_alert_websockets.remove(websocket)
