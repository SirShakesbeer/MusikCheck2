import type { GameState } from '../types';

const WS_BASE = import.meta.env.VITE_WS_BASE ?? 'ws://localhost:8000';

export function connectLobbySocket(lobbyCode: string, onState: (state: GameState) => void): () => void {
  const socket = new WebSocket(`${WS_BASE}/ws/${lobbyCode}`);

  socket.onmessage = (event) => {
    const payload = JSON.parse(event.data);
    if (payload.type === 'state') {
      onState(payload.data as GameState);
    }
  };

  const heartbeat = window.setInterval(() => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send('ping');
    }
  }, 15000);

  return () => {
    window.clearInterval(heartbeat);
    if (socket.readyState === WebSocket.OPEN) {
      socket.close();
    }
  };
}
