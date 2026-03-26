from typing import Any

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


class SetTeamsRequest(BaseModel):
    team_names: list[str] = Field(min_length=1)


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


class ToggleTeamFactRequest(BaseModel):
    team_id: str
    fact: str  # 'artist' or 'title'


class ApplyWrongGuessPenaltyRequest(BaseModel):
    team_id: str


class TeamGuessState(BaseModel):
    team_id: str
    artist_guessed: bool
    title_guessed: bool
    artist_points: int
    title_points: int
    bonus_points: int
    total_points: int


class RoundState(BaseModel):
    round_kind: str
    song_number: int
    stage_index: int
    stage_duration_seconds: int
    points_available: int
    snippet_url: str
    can_guess: bool
    status: str
    team_guesses: dict[str, TeamGuessState] = {}


class GameState(BaseModel):
    lobby_code: str
    mode_key: str
    mode: GameModePresetState
    teams: list[TeamState]
    players: list[PlayerState]
    current_round: RoundState | None
    host_runtime_state: dict[str, Any] | None = None
    message: str | None = None


class UpdateHostRuntimeStateRequest(BaseModel):
    state: dict[str, Any]


class ApiEnvelope(BaseModel):
    ok: bool = True
    data: GameState


class RuntimeConfigState(BaseModel):
    test_mode: bool
    youtube_api_key_configured: bool


class RuntimeConfigUpdateRequest(BaseModel):
    test_mode: bool
