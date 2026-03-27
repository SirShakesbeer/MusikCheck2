from pydantic import BaseModel, Field

from app.schemas.game_mode import GameModePresetConfig, GameModePresetState


class CreateLobbyRequest(BaseModel):
    host_name: str = Field(min_length=1, max_length=64)
    preset_key: str = Field(default="classic_audio", min_length=1)
    mode_config: GameModePresetConfig | None = None
    save_as_preset: bool = False
    preset_name: str | None = Field(default=None, max_length=64)


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


class LocalMediaItem(BaseModel):
    title: str
    artist: str
    source_id: str
    source_type: str  # 'local' | 'youtube' | 'spotify'
    source_value: str
    snippet_url: str
    duration_seconds: int | None = None
    spotify_track_id: str | None = None


class SetupLocalMediaRequest(BaseModel):
    media_items: list[LocalMediaItem]


class NextLocalSongResponse(BaseModel):
    round_kind: str
    song_number: int
    stage_index: int
    stage_duration_seconds: int
    points_available: int
    snippet_url: str
    can_guess: bool
    status: str
    snippet_start_offsets: list[int]
    media_title: str
    media_artist: str


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


class RoundState(BaseModel):
    round_kind: str
    song_number: int
    stage_index: int
    stage_duration_seconds: int
    points_available: int
    snippet_url: str
    can_guess: bool
    status: str


class RoundTeamState(BaseModel):
    team_id: str
    artist_points: int
    title_points: int
    bonus_points: int


class GameState(BaseModel):
    lobby_code: str
    mode_key: str
    mode: GameModePresetState
    teams: list[TeamState]
    players: list[PlayerState]
    current_round: RoundState | None
    round_team_states: list[RoundTeamState] = []
    message: str | None = None


class ApiEnvelope(BaseModel):
    ok: bool = True
    data: GameState


class RuntimeConfigState(BaseModel):
    test_mode: bool
    youtube_api_key_configured: bool


class RuntimeConfigUpdateRequest(BaseModel):
    test_mode: bool
