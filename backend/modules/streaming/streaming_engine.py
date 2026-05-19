import asyncio
import json
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Callable
from collections import deque
from pydantic import BaseModel
import pandas as pd
import numpy as np


class StreamSourceConfig(BaseModel):
    source_type: str
    config: Dict[str, Any]
    name: str
    description: Optional[str] = None


class WindowConfig(BaseModel):
    window_type: str = "sliding"
    size: int = 60
    unit: str = "seconds"
    slide: Optional[int] = None


class StreamBufferConfig(BaseModel):
    max_size: int = 10000
    flush_interval: int = 1
    strategy: str = "drop_oldest"


class StreamPipeline:
    def __init__(
        self,
        stream_id: str,
        source_config: StreamSourceConfig,
        window_config: Optional[WindowConfig] = None,
        buffer_config: Optional[StreamBufferConfig] = None,
    ):
        self.stream_id = stream_id
        self.source_config = source_config
        self.window_config = window_config or WindowConfig()
        self.buffer_config = buffer_config or StreamBufferConfig()
        self.status = "stopped"
        self.data_buffer = deque(maxlen=self.buffer_config.max_size)
        self.window_data: deque = deque()
        self.subscribers: List[Callable] = []
        self.start_time: Optional[datetime] = None
        self.end_time: Optional[datetime] = None
        self.total_records = 0
        self.error_count = 0
        self._task: Optional[asyncio.Task] = None
        self._stop_event = asyncio.Event()

    def add_subscriber(self, callback: Callable):
        self.subscribers.append(callback)

    def remove_subscriber(self, callback: Callable):
        if callback in self.subscribers:
            self.subscribers.remove(callback)

    async def _notify_subscribers(self, data: Dict[str, Any]):
        for callback in self.subscribers:
            try:
                if asyncio.iscoroutinefunction(callback):
                    await callback(data)
                else:
                    callback(data)
            except Exception as e:
                print(f"Error notifying subscriber: {e}")

    def _add_to_window(self, record: Dict[str, Any]):
        timestamp = record.get("_timestamp", datetime.now())
        if isinstance(timestamp, str):
            timestamp = datetime.fromisoformat(timestamp)
        
        self.window_data.append((timestamp, record))
        
        window_size = self._get_window_seconds()
        cutoff_time = datetime.now() - timedelta(seconds=window_size)
        
        while self.window_data and self.window_data[0][0] < cutoff_time:
            self.window_data.popleft()

    def _get_window_seconds(self) -> int:
        unit_multipliers = {
            "seconds": 1,
            "minutes": 60,
            "hours": 3600,
            "days": 86400,
        }
        return self.window_config.size * unit_multipliers.get(self.window_config.unit, 1)

    def get_window_data(self) -> List[Dict[str, Any]]:
        return [record for _, record in self.window_data]

    def get_window_dataframe(self) -> pd.DataFrame:
        data = self.get_window_data()
        if not data:
            return pd.DataFrame()
        return pd.DataFrame(data)

    def get_aggregated_data(self, agg_config: Dict[str, Any]) -> Dict[str, Any]:
        df = self.get_window_dataframe()
        if df.empty:
            return {}
        
        result = {}
        for metric, config in agg_config.items():
            column = config.get("column")
            agg_func = config.get("function", "sum")
            
            if column not in df.columns:
                continue
                
            series = df[column].dropna()
            if len(series) == 0:
                result[metric] = None
                continue
                
            if agg_func == "sum":
                result[metric] = float(series.sum())
            elif agg_func == "mean":
                result[metric] = float(series.mean())
            elif agg_func == "count":
                result[metric] = int(series.count())
            elif agg_func == "min":
                result[metric] = float(series.min())
            elif agg_func == "max":
                result[metric] = float(series.max())
            elif agg_func == "std":
                result[metric] = float(series.std())
        
        return result

    async def start(self):
        self.status = "running"
        self.start_time = datetime.now()
        self._stop_event.clear()
        
        if self.source_config.source_type == "simulation":
            self._task = asyncio.create_task(self._run_simulation())
        elif self.source_config.source_type == "websocket":
            self._task = asyncio.create_task(self._run_websocket())
        elif self.source_config.source_type == "replay":
            self._task = asyncio.create_task(self._run_replay())

    async def stop(self):
        self.status = "stopped"
        self.end_time = datetime.now()
        self._stop_event.set()
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    async def pause(self):
        self.status = "paused"

    async def resume(self):
        self.status = "running"

    async def _run_simulation(self):
        config = self.source_config.config
        interval = config.get("interval", 1)
        data_template = config.get("data_template", {})
        
        while not self._stop_event.is_set():
            if self.status != "running":
                await asyncio.sleep(interval)
                continue
            
            try:
                record = self._generate_simulated_data(data_template)
                record["_timestamp"] = datetime.now().isoformat()
                record["_stream_id"] = self.stream_id
                
                self.data_buffer.append(record)
                self._add_to_window(record)
                self.total_records += 1
                
                await self._notify_subscribers({
                    "type": "new_record",
                    "stream_id": self.stream_id,
                    "data": record,
                    "timestamp": datetime.now().isoformat(),
                })
                
            except Exception as e:
                self.error_count += 1
                print(f"Simulation error: {e}")
            
            await asyncio.sleep(interval)

    def _generate_simulated_data(self, template: Dict[str, Any]) -> Dict[str, Any]:
        result = {}
        for key, config in template.items():
            if isinstance(config, dict):
                data_type = config.get("type", "int")
                if data_type == "int":
                    result[key] = np.random.randint(
                        config.get("min", 0), config.get("max", 100)
                    )
                elif data_type == "float":
                    result[key] = round(
                        np.random.uniform(
                            config.get("min", 0.0), config.get("max", 100.0)
                        ),
                        2,
                    )
                elif data_type == "choice":
                    choices = config.get("choices", [])
                    result[key] = np.random.choice(choices) if choices else None
                elif data_type == "timestamp":
                    result[key] = datetime.now().isoformat()
                else:
                    result[key] = config.get("default", None)
            else:
                result[key] = config
        return result

    async def _run_websocket(self):
        config = self.source_config.config
        url = config.get("url")
        
        try:
            import websockets
            
            async with websockets.connect(url) as websocket:
                while not self._stop_event.is_set():
                    if self.status != "running":
                        await asyncio.sleep(0.1)
                        continue
                    
                    try:
                        message = await asyncio.wait_for(websocket.recv(), timeout=1.0)
                        record = json.loads(message)
                        record["_timestamp"] = datetime.now().isoformat()
                        record["_stream_id"] = self.stream_id
                        
                        self.data_buffer.append(record)
                        self._add_to_window(record)
                        self.total_records += 1
                        
                        await self._notify_subscribers({
                            "type": "new_record",
                            "stream_id": self.stream_id,
                            "data": record,
                            "timestamp": datetime.now().isoformat(),
                        })
                        
                    except asyncio.TimeoutError:
                        continue
                    except json.JSONDecodeError:
                        self.error_count += 1
                        continue
                        
        except Exception as e:
            print(f"WebSocket error: {e}")
            self.status = "error"

    async def _run_replay(self):
        config = self.source_config.config
        dataset_id = config.get("dataset_id")
        speed = config.get("speed", 1.0)
        timestamp_column = config.get("timestamp_column")
        
        from main import data_store
        
        if dataset_id not in data_store:
            print(f"Dataset {dataset_id} not found for replay")
            self.status = "error"
            return
        
        df = data_store[dataset_id]
        records = df.to_dict("records")
        
        for record in records:
            if self._stop_event.is_set():
                break
                
            if self.status != "running":
                await asyncio.sleep(0.1)
                continue
            
            try:
                record["_timestamp"] = datetime.now().isoformat()
                record["_stream_id"] = self.stream_id
                
                if timestamp_column and timestamp_column in record:
                    record["_original_timestamp"] = record[timestamp_column]
                
                self.data_buffer.append(record)
                self._add_to_window(record)
                self.total_records += 1
                
                await self._notify_subscribers({
                    "type": "new_record",
                    "stream_id": self.stream_id,
                    "data": record,
                    "timestamp": datetime.now().isoformat(),
                })
                
            except Exception as e:
                self.error_count += 1
                print(f"Replay error: {e}")
            
            await asyncio.sleep(1.0 / speed)

    def get_status(self) -> Dict[str, Any]:
        return {
            "stream_id": self.stream_id,
            "name": self.source_config.name,
            "status": self.status,
            "source_type": self.source_config.source_type,
            "start_time": self.start_time.isoformat() if self.start_time else None,
            "end_time": self.end_time.isoformat() if self.end_time else None,
            "total_records": self.total_records,
            "error_count": self.error_count,
            "buffer_size": len(self.data_buffer),
            "window_size": len(self.window_data),
            "subscribers_count": len(self.subscribers),
            "window_config": self.window_config.dict(),
        }


class StreamingEngine:
    def __init__(self):
        self.pipelines: Dict[str, StreamPipeline] = {}

    def create_pipeline(
        self,
        source_config: StreamSourceConfig,
        window_config: Optional[WindowConfig] = None,
        buffer_config: Optional[StreamBufferConfig] = None,
        stream_id: Optional[str] = None,
    ) -> StreamPipeline:
        stream_id = stream_id or str(uuid.uuid4())
        pipeline = StreamPipeline(
            stream_id=stream_id,
            source_config=source_config,
            window_config=window_config,
            buffer_config=buffer_config,
        )
        self.pipelines[stream_id] = pipeline
        return pipeline

    def get_pipeline(self, stream_id: str) -> Optional[StreamPipeline]:
        return self.pipelines.get(stream_id)

    def list_pipelines(self) -> List[Dict[str, Any]]:
        return [p.get_status() for p in self.pipelines.values()]

    async def start_pipeline(self, stream_id: str) -> bool:
        pipeline = self.get_pipeline(stream_id)
        if pipeline:
            await pipeline.start()
            return True
        return False

    async def stop_pipeline(self, stream_id: str) -> bool:
        pipeline = self.get_pipeline(stream_id)
        if pipeline:
            await pipeline.stop()
            return True
        return False

    async def pause_pipeline(self, stream_id: str) -> bool:
        pipeline = self.get_pipeline(stream_id)
        if pipeline and pipeline.status == "running":
            await pipeline.pause()
            return True
        return False

    async def resume_pipeline(self, stream_id: str) -> bool:
        pipeline = self.get_pipeline(stream_id)
        if pipeline and pipeline.status == "paused":
            await pipeline.resume()
            return True
        return False

    def delete_pipeline(self, stream_id: str) -> bool:
        if stream_id in self.pipelines:
            pipeline = self.pipelines[stream_id]
            if pipeline.status != "stopped":
                asyncio.create_task(pipeline.stop())
            del self.pipelines[stream_id]
            return True
        return False


streaming_engine = StreamingEngine()
