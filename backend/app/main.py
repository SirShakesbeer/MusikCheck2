from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.core.config import settings
from app.core.database import Base, SessionLocal, engine
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


@app.on_event("startup")
def startup() -> None:
    Base.metadata.create_all(bind=engine)


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
