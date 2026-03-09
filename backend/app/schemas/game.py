from pydantic import BaseModel, Field


class CreateLobbyRequest(BaseModel):
    host_name: str = Field(min_length=1, max_length=64)
    mode_key: str = Field(default="classic_audio", min_length=1)


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


class RoundState(BaseModel):
    stage_index: int
    stage_duration_seconds: int
    points_available: int
    snippet_url: str
    can_guess: bool
    status: str


class GameState(BaseModel):
    lobby_code: str
    mode_key: str
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
