import type {
  ApiEnvelope,
  IndexedTracksEnvelope,
  IngestPreviewEnvelope,
  RegisterLocalSourceEnvelope,
  RuntimeConfigEnvelope,
  RunLocalIndexEnvelope,
  RunSourceSyncEnvelope,
} from '../types';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000/api';

async function post<TResponse, TBody extends object>(path: string, body?: TBody): Promise<TResponse> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || `Request failed: ${response.status}`);
  }

  return response.json() as Promise<TResponse>;
}

async function get<TResponse>(path: string): Promise<TResponse> {
  const response = await fetch(`${API_BASE}${path}`);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || `Request failed: ${response.status}`);
  }

  return response.json() as Promise<TResponse>;
}

export const api = {
  getRuntimeConfig: () => get<RuntimeConfigEnvelope>('/runtime/config'),
  updateRuntimeConfig: (testMode: boolean) =>
    post<RuntimeConfigEnvelope, { test_mode: boolean }>('/runtime/config', { test_mode: testMode }),
  getIndexedTracks: (sourceIds?: string[], limit = 500) => {
    const params = new URLSearchParams();
    if (sourceIds && sourceIds.length > 0) {
      params.set('source_ids', sourceIds.join(','));
    }
    params.set('limit', String(limit));
    return get<IndexedTracksEnvelope>(`/media/tracks?${params.toString()}`);
  },
  createLobby: (hostName: string, modeKey = 'classic_audio') =>
    post<ApiEnvelope, { host_name: string; mode_key: string }>('/lobbies', { host_name: hostName, mode_key: modeKey }),
  ingestSourcePreview: (providerKey: string, source: string) =>
    post<IngestPreviewEnvelope, { provider_key: string; source: string }>('/media/ingest-preview', {
      provider_key: providerKey,
      source,
    }),
  registerLocalSource: (folderPath: string) =>
    post<RegisterLocalSourceEnvelope, { folder_path: string }>('/media/sources/local', { folder_path: folderPath }),
  registerSource: (providerKey: string, source: string) =>
    post<
      RegisterLocalSourceEnvelope,
      {
        provider_key: string;
        source: string;
      }
    >('/media/sources/register', { provider_key: providerKey, source }),
  runLocalSourceIndex: (sourceId: string) =>
    post<RunLocalIndexEnvelope, Record<string, never>>(`/media/sources/${sourceId}/index`, {}),
  runSourceSync: (sourceId: string) =>
    post<RunSourceSyncEnvelope, Record<string, never>>(`/media/sources/${sourceId}/sync`, {}),
  joinLobby: (code: string, playerName: string, teamName: string) =>
    post<ApiEnvelope, { player_name: string; team_name: string }>(`/lobbies/${code}/join`, {
      player_name: playerName,
      team_name: teamName,
    }),
  startRound: (code: string) => post<ApiEnvelope, Record<string, never>>(`/lobbies/${code}/rounds/start`, {}),
  stopRound: (code: string, teamId: string, playerName: string) =>
    post<ApiEnvelope, { team_id: string; player_name: string }>(`/lobbies/${code}/rounds/stop`, {
      team_id: teamId,
      player_name: playerName,
    }),
  submitGuess: (code: string, teamId: string, title: string, artist: string) =>
    post<ApiEnvelope, { team_id: string; title: string; artist: string }>(`/lobbies/${code}/rounds/guess`, {
      team_id: teamId,
      title,
      artist,
    }),
  nextStage: (code: string) => post<ApiEnvelope, Record<string, never>>(`/lobbies/${code}/rounds/next-stage`, {}),
};
