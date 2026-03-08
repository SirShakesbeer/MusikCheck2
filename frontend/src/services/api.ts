import type { ApiEnvelope } from '../types';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000/api';

async function post<TBody extends object>(path: string, body?: TBody): Promise<ApiEnvelope> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || `Request failed: ${response.status}`);
  }

  return response.json();
}

export const api = {
  createLobby: (hostName: string, modeKey = 'classic_audio') => post('/lobbies', { host_name: hostName, mode_key: modeKey }),
  joinLobby: (code: string, playerName: string, teamName: string) =>
    post(`/lobbies/${code}/join`, { player_name: playerName, team_name: teamName }),
  startRound: (code: string) => post(`/lobbies/${code}/rounds/start`),
  stopRound: (code: string, teamId: string, playerName: string) =>
    post(`/lobbies/${code}/rounds/stop`, { team_id: teamId, player_name: playerName }),
  submitGuess: (code: string, teamId: string, title: string, artist: string) =>
    post(`/lobbies/${code}/rounds/guess`, { team_id: teamId, title, artist }),
  nextStage: (code: string) => post(`/lobbies/${code}/rounds/next-stage`),
};
