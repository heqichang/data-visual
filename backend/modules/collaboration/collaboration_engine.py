import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
from pydantic import BaseModel
import json


class ShareConfig(BaseModel):
    dashboard_id: str
    share_type: str = "link"
    permissions: str = "view"
    expires_at: Optional[str] = None
    password: Optional[str] = None


class ShareLink(BaseModel):
    share_id: str
    dashboard_id: str
    share_type: str
    permissions: str
    share_url: str
    created_at: str
    expires_at: Optional[str] = None
    access_count: int = 0
    is_active: bool = True


class Comment(BaseModel):
    comment_id: str
    dashboard_id: str
    widget_id: Optional[str] = None
    user_id: str
    user_name: str
    content: str
    created_at: str
    resolved: bool = False
    resolved_at: Optional[str] = None
    parent_id: Optional[str] = None


class ReportTemplate(BaseModel):
    template_id: str
    name: str
    description: str
    layout: Dict[str, Any]
    style: Dict[str, Any]
    created_at: str


class ReportSchedule(BaseModel):
    schedule_id: str
    dashboard_id: str
    template_id: Optional[str] = None
    name: str
    cron_expression: str
    channels: List[Dict[str, Any]]
    last_sent: Optional[str] = None
    next_send: Optional[str] = None
    is_active: bool = True
    created_at: str


class AnalysisNote(BaseModel):
    note_id: str
    dashboard_id: str
    widget_id: Optional[str] = None
    user_id: str
    user_name: str
    title: str
    content: str
    created_at: str
    updated_at: str


class CollaborationEngine:
    def __init__(self):
        self.share_links: Dict[str, ShareLink] = {}
        self.comments: Dict[str, List[Comment]] = {}
        self.report_templates: List[ReportTemplate] = self._init_default_templates()
        self.report_schedules: List[ReportSchedule] = []
        self.notes: Dict[str, List[AnalysisNote]] = {}
        self.active_editors: Dict[str, Dict[str, Any]] = {}

    def _init_default_templates(self) -> List[ReportTemplate]:
        return [
            ReportTemplate(
                template_id=str(uuid.uuid4()),
                name="标准报告",
                description="包含所有图表和分析的完整报告",
                layout={"sections": ["title", "summary", "charts", "analysis"]},
                style={"theme": "light", "page_size": "A4"},
                created_at=datetime.now().isoformat(),
            ),
            ReportTemplate(
                template_id=str(uuid.uuid4()),
                name="简报模板",
                description="精简的关键指标报告",
                layout={"sections": ["title", "kpis", "key_charts"]},
                style={"theme": "dark", "page_size": "A4"},
                created_at=datetime.now().isoformat(),
            ),
        ]

    def create_share_link(self, config: ShareConfig, base_url: str = "http://localhost:3000") -> ShareLink:
        share_id = str(uuid.uuid4())
        share_url = f"{base_url}/share/{share_id}"
        
        share_link = ShareLink(
            share_id=share_id,
            dashboard_id=config.dashboard_id,
            share_type=config.share_type,
            permissions=config.permissions,
            share_url=share_url,
            created_at=datetime.now().isoformat(),
            expires_at=config.expires_at,
            is_active=True,
        )
        
        self.share_links[share_id] = share_link
        return share_link

    def get_share_link(self, share_id: str) -> Optional[ShareLink]:
        link = self.share_links.get(share_id)
        if link:
            link.access_count += 1
        return link

    def list_share_links(self, dashboard_id: Optional[str] = None) -> List[ShareLink]:
        links = list(self.share_links.values())
        if dashboard_id:
            links = [l for l in links if l.dashboard_id == dashboard_id]
        return links

    def delete_share_link(self, share_id: str) -> bool:
        if share_id in self.share_links:
            self.share_links[share_id].is_active = False
            return True
        return False

    def add_comment(self, dashboard_id: str, widget_id: Optional[str], 
                    user_id: str, user_name: str, content: str, 
                    parent_id: Optional[str] = None) -> Comment:
        comment = Comment(
            comment_id=str(uuid.uuid4()),
            dashboard_id=dashboard_id,
            widget_id=widget_id,
            user_id=user_id,
            user_name=user_name,
            content=content,
            created_at=datetime.now().isoformat(),
            parent_id=parent_id,
        )
        
        if dashboard_id not in self.comments:
            self.comments[dashboard_id] = []
        self.comments[dashboard_id].append(comment)
        
        return comment

    def get_comments(self, dashboard_id: str, widget_id: Optional[str] = None) -> List[Comment]:
        comments = self.comments.get(dashboard_id, [])
        if widget_id:
            comments = [c for c in comments if c.widget_id == widget_id]
        return sorted(comments, key=lambda c: c.created_at, reverse=True)

    def resolve_comment(self, comment_id: str) -> bool:
        for dashboard_comments in self.comments.values():
            for comment in dashboard_comments:
                if comment.comment_id == comment_id:
                    comment.resolved = True
                    comment.resolved_at = datetime.now().isoformat()
                    return True
        return False

    def delete_comment(self, comment_id: str) -> bool:
        for dashboard_id, dashboard_comments in self.comments.items():
            for i, comment in enumerate(dashboard_comments):
                if comment.comment_id == comment_id:
                    dashboard_comments.pop(i)
                    return True
        return False

    def get_report_templates(self) -> List[ReportTemplate]:
        return self.report_templates

    def create_report_template(self, name: str, description: str, 
                               layout: Dict[str, Any], style: Dict[str, Any]) -> ReportTemplate:
        template = ReportTemplate(
            template_id=str(uuid.uuid4()),
            name=name,
            description=description,
            layout=layout,
            style=style,
            created_at=datetime.now().isoformat(),
        )
        self.report_templates.append(template)
        return template

    def delete_report_template(self, template_id: str) -> bool:
        for i, t in enumerate(self.report_templates):
            if t.template_id == template_id:
                self.report_templates.pop(i)
                return True
        return False

    def create_report_schedule(self, dashboard_id: str, name: str, cron_expression: str,
                               channels: List[Dict[str, Any]], template_id: Optional[str] = None) -> ReportSchedule:
        schedule = ReportSchedule(
            schedule_id=str(uuid.uuid4()),
            dashboard_id=dashboard_id,
            template_id=template_id,
            name=name,
            cron_expression=cron_expression,
            channels=channels,
            is_active=True,
            created_at=datetime.now().isoformat(),
        )
        self.report_schedules.append(schedule)
        return schedule

    def get_report_schedules(self, dashboard_id: Optional[str] = None) -> List[ReportSchedule]:
        schedules = self.report_schedules
        if dashboard_id:
            schedules = [s for s in schedules if s.dashboard_id == dashboard_id]
        return schedules

    def delete_report_schedule(self, schedule_id: str) -> bool:
        for i, s in enumerate(self.report_schedules):
            if s.schedule_id == schedule_id:
                self.report_schedules.pop(i)
                return True
        return False

    def add_analysis_note(self, dashboard_id: str, user_id: str, user_name: str,
                          title: str, content: str, widget_id: Optional[str] = None) -> AnalysisNote:
        note = AnalysisNote(
            note_id=str(uuid.uuid4()),
            dashboard_id=dashboard_id,
            widget_id=widget_id,
            user_id=user_id,
            user_name=user_name,
            title=title,
            content=content,
            created_at=datetime.now().isoformat(),
            updated_at=datetime.now().isoformat(),
        )
        
        if dashboard_id not in self.notes:
            self.notes[dashboard_id] = []
        self.notes[dashboard_id].append(note)
        
        return note

    def get_analysis_notes(self, dashboard_id: str, widget_id: Optional[str] = None) -> List[AnalysisNote]:
        notes = self.notes.get(dashboard_id, [])
        if widget_id:
            notes = [n for n in notes if n.widget_id == widget_id]
        return sorted(notes, key=lambda n: n.created_at, reverse=True)

    def update_analysis_note(self, note_id: str, title: str, content: str) -> Optional[AnalysisNote]:
        for dashboard_notes in self.notes.values():
            for note in dashboard_notes:
                if note.note_id == note_id:
                    note.title = title
                    note.content = content
                    note.updated_at = datetime.now().isoformat()
                    return note
        return None

    def delete_analysis_note(self, note_id: str) -> bool:
        for dashboard_id, dashboard_notes in self.notes.items():
            for i, note in enumerate(dashboard_notes):
                if note.note_id == note_id:
                    dashboard_notes.pop(i)
                    return True
        return False

    def register_editor(self, dashboard_id: str, user_id: str, user_name: str) -> Dict[str, Any]:
        if dashboard_id not in self.active_editors:
            self.active_editors[dashboard_id] = {}
        
        self.active_editors[dashboard_id][user_id] = {
            "user_id": user_id,
            "user_name": user_name,
            "joined_at": datetime.now().isoformat(),
            "last_active": datetime.now().isoformat(),
        }
        
        return {
            "editors": list(self.active_editors[dashboard_id].values()),
            "total_editors": len(self.active_editors[dashboard_id]),
        }

    def unregister_editor(self, dashboard_id: str, user_id: str) -> Dict[str, Any]:
        if dashboard_id in self.active_editors and user_id in self.active_editors[dashboard_id]:
            del self.active_editors[dashboard_id][user_id]
        
        return {
            "editors": list(self.active_editors.get(dashboard_id, {}).values()),
            "total_editors": len(self.active_editors.get(dashboard_id, {})),
        }

    def get_active_editors(self, dashboard_id: str) -> Dict[str, Any]:
        editors = self.active_editors.get(dashboard_id, {})
        return {
            "editors": list(editors.values()),
            "total_editors": len(editors),
        }

    def generate_report(self, dashboard_id: str, template_id: Optional[str] = None, 
                        format: str = "html") -> Dict[str, Any]:
        from main import dashboard_store
        
        dashboard = dashboard_store.get(dashboard_id)
        if not dashboard:
            raise ValueError("Dashboard not found")
        
        template = None
        if template_id:
            for t in self.report_templates:
                if t.template_id == template_id:
                    template = t
                    break
        
        if not template:
            template = self.report_templates[0]
        
        report_data = {
            "dashboard_id": dashboard_id,
            "dashboard_name": dashboard.get("name", "未命名仪表盘"),
            "generated_at": datetime.now().isoformat(),
            "template": template.name,
            "widgets": dashboard.get("widgets", {}),
            "summary": f"报告包含 {len(dashboard.get('widgets', {}))} 个图表组件",
        }
        
        return {
            "report_data": report_data,
            "format": format,
            "template": template.dict(),
        }

    def send_report(self, report_data: Dict[str, Any], channels: List[Dict[str, Any]]) -> Dict[str, Any]:
        results = []
        for channel in channels:
            channel_type = channel.get("type")
            result = {
                "channel": channel_type,
                "status": "sent",
                "message": f"报告已发送到 {channel_type}",
            }
            
            if channel_type == "email":
                result["recipient"] = channel.get("email", "")
            elif channel_type == "slack":
                result["webhook"] = channel.get("webhook_url", "")
            elif channel_type == "feishu":
                result["webhook"] = channel.get("webhook_url", "")
            elif channel_type == "webhook":
                result["url"] = channel.get("url", "")
            
            results.append(result)
        
        return {"results": results, "total_sent": len(results)}


collaboration_engine = CollaborationEngine()
