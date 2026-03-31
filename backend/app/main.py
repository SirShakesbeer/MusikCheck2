import asyncio

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import OperationalError

from app.api.routes import router
from app.core.config import settings
from app.core.database import Base, SessionLocal, apply_schema_patches, engine
from app.core.ws_manager import ws_manager
from app.services.service_container import game_engine

app = FastAPI(title=settings.app_name)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix=settings.api_prefix)

cleanup_task: asyncio.Task | None = None


async def run_periodic_cleanup() -> None:
    while True:
        try:
            with SessionLocal() as db:
                game_engine.cleanup_expired_lobbies_and_orphan_links(db)
        except Exception:
            # Cleanup is best-effort and should never crash the app loop.
            pass
        await asyncio.sleep(300)


@app.on_event("startup")
async def startup() -> None:
    max_attempts = 20
    delay_seconds = 1.5
    last_error: Exception | None = None

    for _ in range(max_attempts):
        try:
            Base.metadata.create_all(bind=engine)
            apply_schema_patches()
            with SessionLocal() as db:
                game_engine.cleanup_expired_lobbies_and_orphan_links(db)

            global cleanup_task
            cleanup_task = asyncio.create_task(run_periodic_cleanup())
            return
        except OperationalError as error:
            last_error = error
            await asyncio.sleep(delay_seconds)

    raise RuntimeError("Database unavailable after startup retries") from last_error


@app.on_event("shutdown")
async def shutdown() -> None:
    global cleanup_task
    if cleanup_task:
        cleanup_task.cancel()
        try:
            await cleanup_task
        except asyncio.CancelledError:
            pass
        cleanup_task = None


@app.websocket("/ws/{lobby_code}")
async def lobby_ws(websocket: WebSocket, lobby_code: str):
    await ws_manager.connect(lobby_code, websocket)
    try:
        with SessionLocal() as db:
            state = game_engine.get_state(db, lobby_code, message="Connected")
        await websocket.send_json({"type": "state", "data": state.model_dump()})

        while True:
            _ = await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(lobby_code, websocket)
    except Exception:
        ws_manager.disconnect(lobby_code, websocket)
        await websocket.close()
