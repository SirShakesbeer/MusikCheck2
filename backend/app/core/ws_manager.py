from collections import defaultdict
from fastapi import WebSocket


class WebSocketManager:
    def __init__(self) -> None:
        self._connections: dict[str, set[WebSocket]] = defaultdict(set)

    async def connect(self, lobby_code: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections[lobby_code].add(websocket)

    def disconnect(self, lobby_code: str, websocket: WebSocket) -> None:
        if lobby_code in self._connections:
            self._connections[lobby_code].discard(websocket)
            if not self._connections[lobby_code]:
                del self._connections[lobby_code]

    async def broadcast(self, lobby_code: str, payload: dict) -> None:
        for ws in list(self._connections.get(lobby_code, [])):
            await ws.send_json(payload)


ws_manager = WebSocketManager()
