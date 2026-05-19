import uuid
import asyncio
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Callable
from pydantic import BaseModel
import pandas as pd
import numpy as np


class AlertCondition(BaseModel):
    column: str
    operator: str
    threshold: float
    aggregation: Optional[str] = None


class AlertRule(BaseModel):
    rule_id: str
    name: str
    description: str
    dataset_id: Optional[str] = None
    stream_id: Optional[str] = None
    conditions: List[AlertCondition]
    logic_operator: str = "AND"
    level: str = "warning"
    channels: List[Dict[str, Any]]
    silent_period: int = 300
    is_active: bool = True
    created_at: str
    last_triggered: Optional[str] = None
    trigger_count: int = 0


class AlertRecord(BaseModel):
    alert_id: str
    rule_id: str
    rule_name: str
    level: str
    message: str
    triggered_at: str
    data: Dict[str, Any]
    acknowledged: bool = False
    acknowledged_at: Optional[str] = None
    acknowledged_by: Optional[str] = None
    resolved: bool = False
    resolved_at: Optional[str] = None


class AlertEngine:
    def __init__(self):
        self.rules: Dict[str, AlertRule] = {}
        self.alerts: List[AlertRecord] = []
        self._last_trigger_times: Dict[str, datetime] = {}
        self._check_task: Optional[asyncio.Task] = None
        self._check_interval: int = 60
        self._subscribers: List[Callable] = []

    def add_subscriber(self, callback: Callable):
        self._subscribers.append(callback)

    def remove_subscriber(self, callback: Callable):
        if callback in self._subscribers:
            self._subscribers.remove(callback)

    async def _notify_subscribers(self, alert: AlertRecord):
        for callback in self._subscribers:
            try:
                if asyncio.iscoroutinefunction(callback):
                    await callback(alert)
                else:
                    callback(alert)
            except Exception as e:
                print(f"Error notifying subscriber: {e}")

    def create_rule(self, name: str, description: str, conditions: List[Dict[str, Any]],
                    dataset_id: Optional[str] = None, stream_id: Optional[str] = None,
                    logic_operator: str = "AND", level: str = "warning",
                    channels: List[Dict[str, Any]] = None, silent_period: int = 300) -> AlertRule:
        rule_id = str(uuid.uuid4())
        
        alert_conditions = [AlertCondition(**c) for c in conditions]
        
        rule = AlertRule(
            rule_id=rule_id,
            name=name,
            description=description,
            dataset_id=dataset_id,
            stream_id=stream_id,
            conditions=alert_conditions,
            logic_operator=logic_operator,
            level=level,
            channels=channels or [],
            silent_period=silent_period,
            is_active=True,
            created_at=datetime.now().isoformat(),
        )
        
        self.rules[rule_id] = rule
        return rule

    def get_rule(self, rule_id: str) -> Optional[AlertRule]:
        return self.rules.get(rule_id)

    def list_rules(self, dataset_id: Optional[str] = None, stream_id: Optional[str] = None,
                   level: Optional[str] = None, is_active: Optional[bool] = None) -> List[AlertRule]:
        rules = list(self.rules.values())
        
        if dataset_id:
            rules = [r for r in rules if r.dataset_id == dataset_id]
        if stream_id:
            rules = [r for r in rules if r.stream_id == stream_id]
        if level:
            rules = [r for r in rules if r.level == level]
        if is_active is not None:
            rules = [r for r in rules if r.is_active == is_active]
        
        return rules

    def update_rule(self, rule_id: str, **kwargs) -> Optional[AlertRule]:
        rule = self.rules.get(rule_id)
        if not rule:
            return None
        
        for key, value in kwargs.items():
            if key == "conditions":
                rule.conditions = [AlertCondition(**c) for c in value]
            elif hasattr(rule, key):
                setattr(rule, key, value)
        
        return rule

    def delete_rule(self, rule_id: str) -> bool:
        if rule_id in self.rules:
            del self.rules[rule_id]
            return True
        return False

    def toggle_rule(self, rule_id: str, is_active: bool) -> Optional[AlertRule]:
        rule = self.rules.get(rule_id)
        if rule:
            rule.is_active = is_active
            return rule
        return None

    def _evaluate_condition(self, df: pd.DataFrame, condition: AlertCondition) -> bool:
        if condition.column not in df.columns:
            return False
        
        series = df[condition.column].dropna()
        if len(series) == 0:
            return False
        
        if condition.aggregation:
            if condition.aggregation == "mean":
                value = float(series.mean())
            elif condition.aggregation == "sum":
                value = float(series.sum())
            elif condition.aggregation == "max":
                value = float(series.max())
            elif condition.aggregation == "min":
                value = float(series.min())
            elif condition.aggregation == "count":
                value = float(len(series))
            else:
                value = float(series.iloc[-1])
        else:
            value = float(series.iloc[-1])
        
        threshold = condition.threshold
        op = condition.operator
        
        if op == ">":
            return value > threshold
        elif op == ">=":
            return value >= threshold
        elif op == "<":
            return value < threshold
        elif op == "<=":
            return value <= threshold
        elif op == "==":
            return abs(value - threshold) < 1e-9
        elif op == "!=":
            return abs(value - threshold) >= 1e-9
        else:
            return False

    def evaluate_rule(self, rule: AlertRule, df: pd.DataFrame) -> bool:
        if not rule.is_active:
            return False
        
        results = []
        for condition in rule.conditions:
            results.append(self._evaluate_condition(df, condition))
        
        if rule.logic_operator == "AND":
            return all(results)
        elif rule.logic_operator == "OR":
            return any(results)
        else:
            return all(results)

    async def check_rules(self, dataset_id: Optional[str] = None, stream_id: Optional[str] = None):
        from main import data_store
        from modules.streaming.streaming_engine import streaming_engine
        
        rules_to_check = list(self.rules.values())
        
        if dataset_id:
            rules_to_check = [r for r in rules_to_check if r.dataset_id == dataset_id]
        if stream_id:
            rules_to_check = [r for r in rules_to_check if r.stream_id == stream_id]
        
        for rule in rules_to_check:
            if not rule.is_active:
                continue
            
            last_triggered = self._last_trigger_times.get(rule.rule_id)
            if last_triggered:
                elapsed = (datetime.now() - last_triggered).total_seconds()
                if elapsed < rule.silent_period:
                    continue
            
            df = None
            if rule.dataset_id and rule.dataset_id in data_store:
                df = data_store[rule.dataset_id]
            elif rule.stream_id:
                pipeline = streaming_engine.get_pipeline(rule.stream_id)
                if pipeline:
                    df = pipeline.get_window_dataframe()
            
            if df is None or df.empty:
                continue
            
            if self.evaluate_rule(rule, df):
                await self._trigger_alert(rule, df)

    async def _trigger_alert(self, rule: AlertRule, df: pd.DataFrame):
        alert_id = str(uuid.uuid4())
        
        condition_descriptions = []
        for cond in rule.conditions:
            agg = f"{cond.aggregation} of " if cond.aggregation else ""
            condition_descriptions.append(f"{agg}{cond.column} {cond.operator} {cond.threshold}")
        
        message = f"告警规则 '{rule.name}' 触发: {', '.join(condition_descriptions)}"
        
        alert = AlertRecord(
            alert_id=alert_id,
            rule_id=rule.rule_id,
            rule_name=rule.name,
            level=rule.level,
            message=message,
            triggered_at=datetime.now().isoformat(),
            data={
                "row_count": len(df),
                "columns": list(df.columns),
                "sample_data": df.head(5).to_dict("records"),
            },
        )
        
        self.alerts.insert(0, alert)
        if len(self.alerts) > 1000:
            self.alerts.pop()
        
        rule.last_triggered = datetime.now().isoformat()
        rule.trigger_count += 1
        self._last_trigger_times[rule.rule_id] = datetime.now()
        
        await self._send_notifications(rule, alert)
        await self._notify_subscribers(alert)

    async def _send_notifications(self, rule: AlertRule, alert: AlertRecord):
        for channel in rule.channels:
            try:
                channel_type = channel.get("type")
                
                if channel_type == "email":
                    await self._send_email(channel, alert)
                elif channel_type == "slack":
                    await self._send_slack(channel, alert)
                elif channel_type == "feishu":
                    await self._send_feishu(channel, alert)
                elif channel_type == "webhook":
                    await self._send_webhook(channel, alert)
                    
            except Exception as e:
                print(f"Failed to send notification to {channel.get('type')}: {e}")

    async def _send_email(self, channel: Dict[str, Any], alert: AlertRecord):
        print(f"[EMAIL] 发送告警邮件到 {channel.get('to')}: {alert.message}")

    async def _send_slack(self, channel: Dict[str, Any], alert: AlertRecord):
        print(f"[SLACK] 发送Slack告警: {alert.message}")

    async def _send_feishu(self, channel: Dict[str, Any], alert: AlertRecord):
        print(f"[FEISHU] 发送飞书告警: {alert.message}")

    async def _send_webhook(self, channel: Dict[str, Any], alert: AlertRecord):
        import aiohttp
        url = channel.get("url")
        if url:
            async with aiohttp.ClientSession() as session:
                await session.post(url, json=alert.dict())

    def get_alerts(self, rule_id: Optional[str] = None, level: Optional[str] = None,
                   acknowledged: Optional[bool] = None, resolved: Optional[bool] = None,
                   limit: int = 100) -> List[AlertRecord]:
        alerts = self.alerts
        
        if rule_id:
            alerts = [a for a in alerts if a.rule_id == rule_id]
        if level:
            alerts = [a for a in alerts if a.level == level]
        if acknowledged is not None:
            alerts = [a for a in alerts if a.acknowledged == acknowledged]
        if resolved is not None:
            alerts = [a for a in alerts if a.resolved == resolved]
        
        return alerts[:limit]

    def get_alert(self, alert_id: str) -> Optional[AlertRecord]:
        for alert in self.alerts:
            if alert.alert_id == alert_id:
                return alert
        return None

    def acknowledge_alert(self, alert_id: str, user_id: str, user_name: str) -> Optional[AlertRecord]:
        alert = self.get_alert(alert_id)
        if alert:
            alert.acknowledged = True
            alert.acknowledged_at = datetime.now().isoformat()
            alert.acknowledged_by = user_name
            return alert
        return None

    def resolve_alert(self, alert_id: str) -> Optional[AlertRecord]:
        alert = self.get_alert(alert_id)
        if alert:
            alert.resolved = True
            alert.resolved_at = datetime.now().isoformat()
            return alert
        return None

    def get_alert_stats(self, hours: int = 24) -> Dict[str, Any]:
        cutoff_time = datetime.now() - timedelta(hours=hours)
        
        recent_alerts = [
            a for a in self.alerts
            if datetime.fromisoformat(a.triggered_at) > cutoff_time
        ]
        
        level_counts = {
            "info": 0,
            "warning": 0,
            "critical": 0,
        }
        
        for alert in recent_alerts:
            if alert.level in level_counts:
                level_counts[alert.level] += 1
        
        return {
            "total_alerts": len(recent_alerts),
            "level_counts": level_counts,
            "acknowledged_count": sum(1 for a in recent_alerts if a.acknowledged),
            "resolved_count": sum(1 for a in recent_alerts if a.resolved),
            "active_rules": sum(1 for r in self.rules.values() if r.is_active),
            "time_period_hours": hours,
        }

    async def start_periodic_check(self, interval: int = 60):
        self._check_interval = interval
        
        async def check_loop():
            while True:
                try:
                    await self.check_rules()
                except Exception as e:
                    print(f"Error in periodic alert check: {e}")
                await asyncio.sleep(self._check_interval)
        
        self._check_task = asyncio.create_task(check_loop())

    def stop_periodic_check(self):
        if self._check_task and not self._check_task.done():
            self._check_task.cancel()


alert_engine = AlertEngine()
