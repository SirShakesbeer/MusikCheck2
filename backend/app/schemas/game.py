from pydantic import BaseModel, Field

from app.core.defaults import DEFAULT_PRESET_KEY
from app.schemas.game_mode import GameModePresetConfig, GameModePresetState


class CreateLobbyRequest(BaseModel):
    host_name: str = Field(min_length=1, max_length=64)
    preset_key: str = Field(default=DEFAULT_PRESET_KEY, min_length=1)
    mode_config: GameModePresetConfig | None = None
    teams: list[str] = []
    save_as_preset: bool = False
    preset_name: str | None = Field(default=None, max_length=64)


class UpdateLobbyModeRequest(BaseModel):
    """Update the game mode config for an existing lobby"""
    preset_key: str | None = None
    mode_config: GameModePresetConfig | None = None


class SaveLobbySetupRequest(BaseModel):
    host_name: str = Field(min_length=1, max_length=64)
    teams: list[str] = []
    preset_key: str | None = None
    mode_title: str | None = Field(default=None, max_length=128)
    mode_config: GameModePresetConfig | None = None
    spotify_connected: bool = False


class LobbySetupState(BaseModel):
    host_name: str
    teams: list[str]
    preset_key: str
    mode_title: str
    spotify_connected: bool


class LobbySourceState(BaseModel):
    source_id: str
    source_type: str
    source_value: str
    imported_count: int


class LobbySpotifyStateRequest(BaseModel):
    connected: bool


class JoinLobbyRequest(BaseModel):
    player_name: str = Field(min_length=1, max_length=64)
    team_name: str = Field(min_length=1, max_length=64)


class StopRequest(BaseModel):
    team_id: str
    player_name: str


class GuessRequest(BaseModel):
    team_id: str
    title: str
    artist: str


class TeamFactToggleRequest(BaseModel):
    team_id: str
    fact: str = Field(min_length=1, max_length=16)


class TeamPenaltyRequest(BaseModel):
    team_id: str


class TeamState(BaseModel):
    id: str
    name: str
    score: int


class PlayerState(BaseModel):
    id: str
    name: str
    team_id: str | None
    ready: bool = False


class PlayerReadyRequest(BaseModel):
    player_id: str
    ready: bool


class PlayStageRequest(BaseModel):
    stage_index: int = Field(ge=0)


class StagePlaybackState(BaseModel):
    stage_index: int
    start_at_seconds: int
    duration_seconds: int


class RoundState(BaseModel):
    round_kind: str
    song_number: int
    stage_index: int
    max_stage_reached: int
    stage_duration_seconds: int
    points_available: int
    snippet_url: str
    playback_provider: str
    playback_ref: str
    track_duration_seconds: int
    snippet_start_offsets: list[int]
    stage_playback: StagePlaybackState
    can_guess: bool
    status: str
    playback_token: int = 0
    reveal_title: str | None = None
    reveal_artist: str | None = None
    reveal_source: str | None = None


class RoundTeamState(BaseModel):
    team_id: str
    artist_points: int
    title_points: int
    bonus_points: int
    artist_awarded_stage: int | None = None
    title_awarded_stage: int | None = None
    artist_remove_locked: bool = False
    title_remove_locked: bool = False


class TeamFinishStatsState(BaseModel):
    team_id: str
    team_name: str
    score: int
    rank: int
    is_winner: bool


class FinishGameStatsState(BaseModel):
    lobby_code: str
    finished_at: str
    required_points_to_win: int
    total_songs_played: int
    total_players: int
    total_points_awarded: int
    top_score: int
    average_score: float
    winner_team_ids: list[str]
    winner_team_names: list[str]
    teams: list[TeamFinishStatsState]


class GameState(BaseModel):
    lobby_code: str
    mode_key: str
    mode: GameModePresetState
    teams: list[TeamState]
    winner_team_ids: list[str] = []
    has_winner_lock: bool = False
    players: list[PlayerState]
    current_round: RoundState | None
    round_team_states: list[RoundTeamState] = []
    message: str | None = None


class ApiEnvelope(BaseModel):
    ok: bool = True
    data: GameState


class FinishGameEnvelope(BaseModel):
    ok: bool = True
    data: FinishGameStatsState


class RuntimeConfigState(BaseModel):
    test_mode: bool
    youtube_api_key_configured: bool


class RuntimeConfigUpdateRequest(BaseModel):
    test_mode: bool


class SyncTeamsRequest(BaseModel):
    teams: list[str]


class LobbyReadinessState(BaseModel):
    ready: bool
    issues: list[str] = []
