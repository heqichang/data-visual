from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from typing import Dict, Any, Optional, List
from pydantic import BaseModel

from .collaboration_engine import (
    collaboration_engine,
    ShareConfig,
)

router = APIRouter(prefix="/api/collaboration", tags=["collaboration"])

active_collab_websockets: Dict[str, List[WebSocket]] = {}


class CreateShareRequest(BaseModel):
    dashboard_id: str
    share_type: str = "link"
    permissions: str = "view"
    expires_at: Optional[str] = None
    password: Optional[str] = None


class AddCommentRequest(BaseModel):
    dashboard_id: str
    widget_id: Optional[str] = None
    user_id: str
    user_name: str
    content: str
    parent_id: Optional[str] = None


class AddNoteRequest(BaseModel):
    dashboard_id: str
    widget_id: Optional[str] = None
    user_id: str
    user_name: str
    title: str
    content: str


class UpdateNoteRequest(BaseModel):
    title: str
    content: str


class CreateReportScheduleRequest(BaseModel):
    dashboard_id: str
    name: str
    cron_expression: str
    channels: List[Dict[str, Any]]
    template_id: Optional[str] = None


class GenerateReportRequest(BaseModel):
    dashboard_id: str
    template_id: Optional[str] = None
    format: str = "html"


class SendReportRequest(BaseModel):
    report_data: Dict[str, Any]
    channels: List[Dict[str, Any]]


class RegisterEditorRequest(BaseModel):
    dashboard_id: str
    user_id: str
    user_name: str


@router.post("/share")
async def create_share_link(request: CreateShareRequest):
    config = ShareConfig(
        dashboard_id=request.dashboard_id,
        share_type=request.share_type,
        permissions=request.permissions,
        expires_at=request.expires_at,
        password=request.password,
    )
    
    share_link = collaboration_engine.create_share_link(config)
    return {
        "share_id": share_link.share_id,
        "share_url": share_link.share_url,
        "status": "success",
    }


@router.get("/share")
async def list_share_links(dashboard_id: Optional[str] = None):
    links = collaboration_engine.list_share_links(dashboard_id)
    return {"share_links": [l.dict() for l in links]}


@router.get("/share/{share_id}")
async def get_share_link(share_id: str):
    link = collaboration_engine.get_share_link(share_id)
    if not link:
        raise HTTPException(status_code=404, detail="分享链接不存在")
    return link.dict()


@router.delete("/share/{share_id}")
async def delete_share_link(share_id: str):
    success = collaboration_engine.delete_share_link(share_id)
    if not success:
        raise HTTPException(status_code=404, detail="分享链接不存在")
    return {"status": "success", "message": "分享链接已撤销"}


@router.post("/comments")
async def add_comment(request: AddCommentRequest):
    comment = collaboration_engine.add_comment(
        dashboard_id=request.dashboard_id,
        widget_id=request.widget_id,
        user_id=request.user_id,
        user_name=request.user_name,
        content=request.content,
        parent_id=request.parent_id,
    )
    return {"comment_id": comment.comment_id, "status": "success"}


@router.get("/comments/{dashboard_id}")
async def get_comments(dashboard_id: str, widget_id: Optional[str] = None):
    comments = collaboration_engine.get_comments(dashboard_id, widget_id)
    return {"comments": [c.dict() for c in comments]}


@router.post("/comments/{comment_id}/resolve")
async def resolve_comment(comment_id: str):
    success = collaboration_engine.resolve_comment(comment_id)
    if not success:
        raise HTTPException(status_code=404, detail="评论不存在")
    return {"status": "success", "message": "评论已标记为已解决"}


@router.delete("/comments/{comment_id}")
async def delete_comment(comment_id: str):
    success = collaboration_engine.delete_comment(comment_id)
    if not success:
        raise HTTPException(status_code=404, detail="评论不存在")
    return {"status": "success", "message": "评论已删除"}


@router.get("/report-templates")
async def get_report_templates():
    templates = collaboration_engine.get_report_templates()
    return {"templates": [t.dict() for t in templates]}


@router.post("/report-schedules")
async def create_report_schedule(request: CreateReportScheduleRequest):
    schedule = collaboration_engine.create_report_schedule(
        dashboard_id=request.dashboard_id,
        name=request.name,
        cron_expression=request.cron_expression,
        channels=request.channels,
        template_id=request.template_id,
    )
    return {"schedule_id": schedule.schedule_id, "status": "success"}


@router.get("/report-schedules")
async def get_report_schedules(dashboard_id: Optional[str] = None):
    schedules = collaboration_engine.get_report_schedules(dashboard_id)
    return {"schedules": [s.dict() for s in schedules]}


@router.delete("/report-schedules/{schedule_id}")
async def delete_report_schedule(schedule_id: str):
    success = collaboration_engine.delete_report_schedule(schedule_id)
    if not success:
        raise HTTPException(status_code=404, detail="定时任务不存在")
    return {"status": "success", "message": "定时任务已删除"}


@router.post("/reports/generate")
async def generate_report(request: GenerateReportRequest):
    try:
        report = collaboration_engine.generate_report(
            dashboard_id=request.dashboard_id,
            template_id=request.template_id,
            format=request.format,
        )
        return report
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/reports/send")
async def send_report(request: SendReportRequest):
    result = collaboration_engine.send_report(
        report_data=request.report_data,
        channels=request.channels,
    )
    return result


@router.post("/notes")
async def add_analysis_note(request: AddNoteRequest):
    note = collaboration_engine.add_analysis_note(
        dashboard_id=request.dashboard_id,
        widget_id=request.widget_id,
        user_id=request.user_id,
        user_name=request.user_name,
        title=request.title,
        content=request.content,
    )
    return {"note_id": note.note_id, "status": "success"}


@router.get("/notes/{dashboard_id}")
async def get_analysis_notes(dashboard_id: str, widget_id: Optional[str] = None):
    notes = collaboration_engine.get_analysis_notes(dashboard_id, widget_id)
    return {"notes": [n.dict() for n in notes]}


@router.put("/notes/{note_id}")
async def update_analysis_note(note_id: str, request: UpdateNoteRequest):
    note = collaboration_engine.update_analysis_note(
        note_id=note_id,
        title=request.title,
        content=request.content,
    )
    if not note:
        raise HTTPException(status_code=404, detail="笔记不存在")
    return {"status": "success", "note": note.dict()}


@router.delete("/notes/{note_id}")
async def delete_analysis_note(note_id: str):
    success = collaboration_engine.delete_analysis_note(note_id)
    if not success:
        raise HTTPException(status_code=404, detail="笔记不存在")
    return {"status": "success", "message": "笔记已删除"}


@router.post("/editors/register")
async def register_editor(request: RegisterEditorRequest):
    result = collaboration_engine.register_editor(
        dashboard_id=request.dashboard_id,
        user_id=request.user_id,
        user_name=request.user_name,
    )
    return result


@router.post("/editors/unregister")
async def unregister_editor(request: RegisterEditorRequest):
    result = collaboration_engine.unregister_editor(
        dashboard_id=request.dashboard_id,
        user_id=request.user_id,
    )
    return result


@router.get("/editors/{dashboard_id}")
async def get_active_editors(dashboard_id: str):
    result = collaboration_engine.get_active_editors(dashboard_id)
    return result


@router.websocket("/ws/collab/{dashboard_id}")
async def collaboration_websocket(websocket: WebSocket, dashboard_id: str):
    await websocket.accept()
    
    if dashboard_id not in active_collab_websockets:
        active_collab_websockets[dashboard_id] = []
    active_collab_websockets[dashboard_id].append(websocket)
    
    try:
        while True:
            data = await websocket.receive_json()
            message_type = data.get("type")
            
            if message_type == "update":
                for conn in active_collab_websockets.get(dashboard_id, []):
                    if conn != websocket:
                        await conn.send_json(data)
            elif message_type == "cursor":
                for conn in active_collab_websockets.get(dashboard_id, []):
                    if conn != websocket:
                        await conn.send_json(data)
            elif message_type == "ping":
                await websocket.send_json({"type": "pong"})
                
    except WebSocketDisconnect:
        if dashboard_id in active_collab_websockets:
            if websocket in active_collab_websockets[dashboard_id]:
                active_collab_websockets[dashboard_id].remove(websocket)
    except Exception as e:
        if dashboard_id in active_collab_websockets:
            if websocket in active_collab_websockets[dashboard_id]:
                active_collab_websockets[dashboard_id].remove(websocket)
