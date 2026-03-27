import type {
  ApiEnvelope,
  CreateGameModePresetEnvelope,
  CreateLobbyPayload,
  GameModeConfig,
  GameModesEnvelope,
  IndexedTracksEnvelope,
  IngestPreviewEnvelope,
  RegisterLocalSourceEnvelope,
  RuntimeConfigEnvelope,
  SpotifyActivateDeviceEnvelope,
  SpotifyAuthUrlEnvelope,
  SpotifyAccessTokenEnvelope,
  SpotifyPlayRandomEnvelope,
  SpotifyStatusEnvelope,
  RunLocalIndexEnvelope,
  CleanupSourcesEnvelope,
  RunSourceSyncEnvelope,
} from '../types';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000/api';

const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 250;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isTransientNetworkError(error: unknown): boolean {
  return error instanceof TypeError;
}

async function requestJson<TResponse>(path: string, init: RequestInit): Promise<TResponse> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(`${API_BASE}${path}`, init);

      if (!response.ok) {
        if (response.status >= 500 && attempt < RETRY_ATTEMPTS) {
          await sleep(RETRY_DELAY_MS * attempt);
          continue;
        }

        const errorText = await response.text();
        const parsed = safeParseError(errorText);
        throw new Error(parsed || `Request failed: ${response.status}`);
      }

      return response.json() as Promise<TResponse>;
    } catch (error) {
      lastError = error;
      if (attempt < RETRY_ATTEMPTS && isTransientNetworkError(error)) {
        await sleep(RETRY_DELAY_MS * attempt);
        continue;
      }
      throw error;
    }
  }

  throw (lastError instanceof Error ? lastError : new Error('Request failed'));
}

async function post<TResponse, TBody extends object>(path: string, body?: TBody): Promise<TResponse> {
  return requestJson<TResponse>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function get<TResponse>(path: string): Promise<TResponse> {
  return requestJson<TResponse>(path, {});
}

function safeParseError(raw: string): string | null {
  const text = raw?.trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed?.detail === 'string' && parsed.detail.trim()) {
      return parsed.detail;
    }
  } catch {
  }
  return text;
}

export const api = {
  getGameModes: () => get<GameModesEnvelope>('/game-modes'),
  createGameModePreset: (name: string, config: GameModeConfig) =>
    post<CreateGameModePresetEnvelope, { name: string; config: GameModeConfig }>('/game-modes', {
      name,
      config,
    }),
  getSpotifyAuthUrl: () => get<SpotifyAuthUrlEnvelope>('/spotify/auth-url'),
  getSpotifyStatus: () => get<SpotifyStatusEnvelope>('/spotify/status'),
  getSpotifyAccessToken: () => get<SpotifyAccessTokenEnvelope>('/spotify/access-token'),
  activateSpotifyDevice: (deviceId: string) =>
    post<SpotifyActivateDeviceEnvelope, { device_id: string }>('/spotify/activate-device', {
      device_id: deviceId,
    }),
  playSpotifyRandom: (
    trackId: string,
    trackDurationSeconds: number,
    snippetDurationSeconds: number,
    deviceId?: string,
    startAtSeconds?: number,
  ) =>
    post<
      SpotifyPlayRandomEnvelope,
      { track_id: string; track_duration_seconds: number; snippet_duration_seconds: number; device_id?: string; start_at_seconds?: number }
    >('/spotify/play-random', {
      track_id: trackId,
      track_duration_seconds: trackDurationSeconds,
      snippet_duration_seconds: snippetDurationSeconds,
      device_id: deviceId,
      start_at_seconds: startAtSeconds,
    }),
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
  createLobby: (payload: CreateLobbyPayload) => post<ApiEnvelope, CreateLobbyPayload>('/lobbies', payload),
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
  cleanupSources: (sourceIds: string[]) =>
    post<CleanupSourcesEnvelope, { source_ids: string[] }>('/media/sources/cleanup', {
      source_ids: sourceIds,
    }),
  joinLobby: (code: string, playerName: string, teamName: string) =>
    post<ApiEnvelope, { player_name: string; team_name: string }>(`/lobbies/${code}/join`, {
      player_name: playerName,
      team_name: teamName,
    }),
  setPlayerReady: (code: string, playerId: string, ready: boolean) =>
    post<ApiEnvelope, { player_id: string; ready: boolean }>(`/lobbies/${code}/players/ready`, {
      player_id: playerId,
      ready,
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
  toggleRoundFact: (code: string, teamId: string, fact: 'artist' | 'title') =>
    post<ApiEnvelope, { team_id: string; fact: string }>(`/lobbies/${code}/rounds/fact-toggle`, {
      team_id: teamId,
      fact,
    }),
  applyWrongGuessPenalty: (code: string, teamId: string) =>
    post<ApiEnvelope, { team_id: string }>(`/lobbies/${code}/rounds/wrong-guess-penalty`, {
      team_id: teamId,
    }),
  setupLocalMedia: (code: string, mediaItems: any[]) =>
    post<{ ok: boolean; data: any }, { media_items: any[] }>(`/lobbies/${code}/setup-local-media`, {
      media_items: mediaItems,
    }),
  nextLocalSong: (code: string) =>
    post<
      { ok: boolean; data: any },
      Record<string, never>
    >(`/lobbies/${code}/rounds/next-local-song`, {}),
  nextStage: (code: string) => post<ApiEnvelope, Record<string, never>>(`/lobbies/${code}/rounds/next-stage`, {}),
};
