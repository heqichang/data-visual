from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from typing import Dict, Any, Optional, List
from pydantic import BaseModel
import json
from datetime import datetime

from .streaming_engine import (
    streaming_engine,
    StreamSourceConfig,
    WindowConfig,
    StreamBufferConfig,
)

router = APIRouter(prefix="/api/streaming", tags=["streaming"])

active_websockets: Dict[str, List[WebSocket]] = {}


class CreateStreamRequest(BaseModel):
    source_type: str
    source_config: Dict[str, Any]
    name: str
    description: Optional[str] = None
    window_config: Optional[Dict[str, Any]] = None
    buffer_config: Optional[Dict[str, Any]] = None


class AggregationRequest(BaseModel):
    stream_id: str
    aggregations: Dict[str, Dict[str, Any]]


@router.post("/streams")
async def create_stream(request: CreateStreamRequest):
    source_config = StreamSourceConfig(
        source_type=request.source_type,
        config=request.source_config,
        name=request.name,
        description=request.description,
    )
    
    window_config = None
    if request.window_config:
        window_config = WindowConfig(**request.window_config)
    
    buffer_config = None
    if request.buffer_config:
        buffer_config = StreamBufferConfig(**request.buffer_config)
    
    pipeline = streaming_engine.create_pipeline(
        source_config=source_config,
        window_config=window_config,
        buffer_config=buffer_config,
    )
    
    return {
        "stream_id": pipeline.stream_id,
        "name": pipeline.source_config.name,
        "status": pipeline.status,
    }


@router.get("/streams")
async def list_streams():
    streams = streaming_engine.list_pipelines()
    return {"streams": streams}


@router.get("/streams/{stream_id}")
async def get_stream(stream_id: str):
    pipeline = streaming_engine.get_pipeline(stream_id)
    if not pipeline:
        raise HTTPException(status_code=404, detail="Stream not found")
    return pipeline.get_status()


@router.post("/streams/{stream_id}/start")
async def start_stream(stream_id: str):
    success = await streaming_engine.start_pipeline(stream_id)
    if not success:
        raise HTTPException(status_code=404, detail="Stream not found")
    return {"status": "success", "message": "Stream started"}


@router.post("/streams/{stream_id}/stop")
async def stop_stream(stream_id: str):
    success = await streaming_engine.stop_pipeline(stream_id)
    if not success:
        raise HTTPException(status_code=404, detail="Stream not found")
    return {"status": "success", "message": "Stream stopped"}


@router.post("/streams/{stream_id}/pause")
async def pause_stream(stream_id: str):
    success = await streaming_engine.pause_pipeline(stream_id)
    if not success:
        raise HTTPException(status_code=404, detail="Stream not found")
    return {"status": "success", "message": "Stream paused"}


@router.post("/streams/{stream_id}/resume")
async def resume_stream(stream_id: str):
    success = await streaming_engine.resume_pipeline(stream_id)
    if not success:
        raise HTTPException(status_code=404, detail="Stream not found")
    return {"status": "success", "message": "Stream resumed"}


@router.delete("/streams/{stream_id}")
async def delete_stream(stream_id: str):
    success = streaming_engine.delete_pipeline(stream_id)
    if not success:
        raise HTTPException(status_code=404, detail="Stream not found")
    return {"status": "success", "message": "Stream deleted"}


@router.get("/streams/{stream_id}/data")
async def get_stream_data(stream_id: str, limit: int = 100):
    pipeline = streaming_engine.get_pipeline(stream_id)
    if not pipeline:
        raise HTTPException(status_code=404, detail="Stream not found")
    
    data = list(pipeline.data_buffer)[-limit:]
    return {
        "stream_id": stream_id,
        "count": len(data),
        "data": data,
    }


@router.get("/streams/{stream_id}/window")
async def get_stream_window(stream_id: str):
    pipeline = streaming_engine.get_pipeline(stream_id)
    if not pipeline:
        raise HTTPException(status_code=404, detail="Stream not found")
    
    data = pipeline.get_window_data()
    return {
        "stream_id": stream_id,
        "window_size": len(data),
        "data": data,
    }


@router.post("/streams/{stream_id}/aggregate")
async def aggregate_stream_data(stream_id: str, request: AggregationRequest):
    pipeline = streaming_engine.get_pipeline(stream_id)
    if not pipeline:
        raise HTTPException(status_code=404, detail="Stream not found")
    
    result = pipeline.get_aggregated_data(request.aggregations)
    return {
        "stream_id": stream_id,
        "aggregations": result,
        "timestamp": datetime.now().isoformat(),
    }


@router.websocket("/ws/{stream_id}")
async def stream_websocket(websocket: WebSocket, stream_id: str):
    await websocket.accept()
    
    pipeline = streaming_engine.get_pipeline(stream_id)
    if not pipeline:
        await websocket.close(code=1008, reason="Stream not found")
        return
    
    if stream_id not in active_websockets:
        active_websockets[stream_id] = []
    active_websockets[stream_id].append(websocket)
    
    async def callback(data: Dict[str, Any]):
        try:
            await websocket.send_json(data)
        except Exception:
            pass
    
    pipeline.add_subscriber(callback)
    
    try:
        while True:
            data = await websocket.receive_json()
            if data.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        pipeline.remove_subscriber(callback)
        if stream_id in active_websockets and websocket in active_websockets[stream_id]:
            active_websockets[stream_id].remove(websocket)
    except Exception as e:
        pipeline.remove_subscriber(callback)
        if stream_id in active_websockets and websocket in active_websockets[stream_id]:
            active_websockets[stream_id].remove(websocket)
