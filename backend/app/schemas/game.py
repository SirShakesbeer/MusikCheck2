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


class GameState(BaseModel):
    lobby_code: str
    mode_key: str
    mode: GameModePresetState
    teams: list[TeamState]
    players: list[PlayerState]
    current_round: RoundState | None
    message: str | None = None


class ApiEnvelope(BaseModel):
    ok: bool = True
    data: GameState


class RuntimeConfigState(BaseModel):
    test_mode: bool
    youtube_api_key_configured: bool


class RuntimeConfigUpdateRequest(BaseModel):
    test_mode: bool
