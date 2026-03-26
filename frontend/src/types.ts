export type TeamState = {
  id: string;
  name: string;
  score: number;
};

export type PlayerState = {
  id: string;
  name: string;
  team_id: string | null;
};

export type RoundState = {
  stage_index: number;
  stage_duration_seconds: number;
  points_available: number;
  snippet_url: string;
  can_guess: boolean;
  status: string;
};

export type GameState = {
  lobby_code: string;
  mode_key: string;
  teams: TeamState[];
  players: PlayerState[];
  current_round: RoundState | null;
  message?: string | null;
};

export type ApiEnvelope = {
  ok: boolean;
  data: GameState;
};

export type IngestPreviewItem = {
  source_id: string;
  title: string;
  artist: string;
};

export type IngestPreviewData = {
  provider_key: string;
  source: string;
  imported_count: number;
  preview_items: IngestPreviewItem[];
};

export type IngestPreviewEnvelope = {
  ok: boolean;
  data: IngestPreviewData;
};

export type LocalSourceState = {
  id: string;
  provider_key: string;
  source_value: string;
  track_count: number;
};

export type RegisterLocalSourceEnvelope = {
  ok: boolean;
  data: {
    source: LocalSourceState;
  };
};

export type RunLocalIndexEnvelope = {
  ok: boolean;
  data: {
    source_id: string;
    indexed_or_updated: number;
    total_tracks: number;
  };
};

export type RunSourceSyncEnvelope = {
  ok: boolean;
  data: {
    source_id: string;
    synced_or_updated: number;
    total_tracks: number;
  };
};

export type RuntimeConfigData = {
  test_mode: boolean;
  youtube_api_key_configured: boolean;
};

export type RuntimeConfigEnvelope = {
  ok: boolean;
  data: RuntimeConfigData;
};

export type IndexedTrackState = {
  id: string;
  source_id: string;
  provider_key: string;
  source_value: string;
  file_path: string;
  title: string;
  artist: string;
  playback_url: string;
  duration_seconds?: number | null;
};

export type IndexedTracksEnvelope = {
  ok: boolean;
  data: {
    tracks: IndexedTrackState[];
  };
};

export type SpotifyAuthUrlEnvelope = {
  ok: boolean;
  data: {
    auth_url: string;
  };
};

export type SpotifyStatusEnvelope = {
  ok: boolean;
  data: {
    connected: boolean;
    expires_in_seconds?: number | null;
  };
};

export type SpotifyPlayRandomEnvelope = {
  ok: boolean;
  data: {
    track_id: string;
    position_ms: number;
  };
};

export type SpotifyAccessTokenEnvelope = {
  ok: boolean;
  data: {
    access_token: string;
  };
};

export type SpotifyActivateDeviceEnvelope = {
  ok: boolean;
  data: {
    device_id: string;
  };
};
