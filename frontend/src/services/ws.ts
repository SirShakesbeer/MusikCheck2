import type { GameState } from '../types';
import { WS_BASE_URL } from '../config/defaults';

const WS_BASE = WS_BASE_URL;

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
