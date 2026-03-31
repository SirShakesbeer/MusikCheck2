export type TeamState = {
  id: string;
  name: string;
  score: number;
};

export type PlayerState = {
  id: string;
  name: string;
  team_id: string | null;
  ready: boolean;
};

export type RoundState = {
  round_kind: string;
  song_number: number;
  stage_index: number;
  max_stage_reached: number;
  stage_duration_seconds: number;
  points_available: number;
  snippet_url: string;
  playback_provider: string;
  playback_ref: string;
  track_duration_seconds: number;
  snippet_start_offsets: number[];
  stage_playback: {
    stage_index: number;
    start_at_seconds: number;
    duration_seconds: number;
  };
  can_guess: boolean;
  status: string;
  playback_token: number;
  reveal_title?: string | null;
  reveal_artist?: string | null;
  reveal_source?: string | null;
};

export type RoundTeamState = {
  team_id: string;
  artist_points: number;
  title_points: number;
  bonus_points: number;
  artist_awarded_stage?: number | null;
  title_awarded_stage?: number | null;
  artist_remove_locked?: boolean;
  title_remove_locked?: boolean;
};

export type GameState = {
  lobby_code: string;
  mode_key: string;
  mode: GameModePresetState;
  teams: TeamState[];
  players: PlayerState[];
  current_round: RoundState | null;
  round_team_states: RoundTeamState[];
  message?: string | null;
};

export type RoundTypeRule = {
  kind: string;
  every_n_songs: number;
};

export type GameModeFilters = {
  release_year_from?: number | null;
  release_year_to?: number | null;
  language?: string | null;
};

export type GameModeConfig = {
  stage_durations: number[];
  stage_points: number[];
  round_rules: RoundTypeRule[];
  bonus_points_both: number;
  wrong_guess_penalty: number;
  required_points_to_win: number;
  filters: GameModeFilters;
};

export type GameModePresetState = {
  key: string;
  name: string;
  stage_durations: number[];
  stage_points: number[];
  bonus_points_both: number;
  wrong_guess_penalty: number;
  required_points_to_win: number;
  round_rules: RoundTypeRule[];
  filters: GameModeFilters;
  requires_phone_connections: boolean;
};

export type GameModesEnvelope = {
  ok: boolean;
  data: GameModePresetState[];
};

export type CreateGameModePresetEnvelope = {
  ok: boolean;
  data: {
    preset: GameModePresetState;
  };
};

export type CreateLobbyPayload = {
  host_name: string;
  preset_key: string;
  mode_config?: GameModeConfig;
  teams?: string[];
  save_as_preset?: boolean;
  preset_name?: string;
};

export type UpdateLobbyModePayload = {
  preset_key?: string;
  mode_config?: GameModeConfig;
};

export type SaveLobbySetupPayload = {
  host_name: string;
  teams: string[];
  preset_key?: string;
  mode_title?: string;
  mode_config?: GameModeConfig;
  spotify_connected: boolean;
};

export type LobbySetupState = {
  host_name: string;
  teams: string[];
  preset_key: string;
  mode_title: string;
  spotify_connected: boolean;
};

export type LobbySourceState = {
  source_id: string;
  source_type: string;
  source_value: string;
  imported_count: number;
};

export type LobbyReadinessState = {
  ready: boolean;
  issues: string[];
};

export type LobbyReadinessEnvelope = {
  ok: boolean;
  data: LobbyReadinessState;
};

export type ApiEnvelope = {
  ok: boolean;
  data: GameState;
};

export type LobbySetupEnvelope = {
  ok: boolean;
  data: LobbySetupState;
};

export type LobbySourcesEnvelope = {
  ok: boolean;
  data: LobbySourceState[];
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

export type CleanupSourcesEnvelope = {
  ok: boolean;
  data: {
    removed_source_ids: string[];
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
