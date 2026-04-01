from pydantic import BaseModel, Field

from app.core.defaults import (
    DEFAULT_BONUS_POINTS_BOTH,
    DEFAULT_REQUIRED_POINTS_TO_WIN,
    DEFAULT_WRONG_GUESS_PENALTY,
)


class RoundTypeRuleState(BaseModel):
    kind: str = Field(min_length=1)
    every_n_songs: int = Field(ge=1)


class RoundTypeDefinitionState(BaseModel):
    kind: str = Field(min_length=1)
    label: str = Field(min_length=1)
    requires_phone_connections: bool = False
    default_every_n_songs: int = Field(ge=1)


class RoundTypesState(BaseModel):
    round_types: list[RoundTypeDefinitionState]


class GameModeFiltersState(BaseModel):
    release_year_from: int | None = None
    release_year_to: int | None = None
    language: str | None = None


class GameModePresetConfig(BaseModel):
    stage_durations: list[int] = Field(min_length=1)
    stage_points: list[int] = Field(min_length=1)
    round_rules: list[RoundTypeRuleState] = Field(min_length=1)
    bonus_points_both: int = Field(default=DEFAULT_BONUS_POINTS_BOTH, ge=0)
    wrong_guess_penalty: int = Field(default=DEFAULT_WRONG_GUESS_PENALTY, ge=0)
    required_points_to_win: int = Field(default=DEFAULT_REQUIRED_POINTS_TO_WIN, ge=1)
    filters: GameModeFiltersState = Field(default_factory=GameModeFiltersState)


class GameModePresetState(BaseModel):
    key: str
    name: str
    stage_durations: list[int]
    stage_points: list[int]
    round_rules: list[RoundTypeRuleState]
    bonus_points_both: int = Field(default=DEFAULT_BONUS_POINTS_BOTH, ge=0)
    wrong_guess_penalty: int = Field(default=DEFAULT_WRONG_GUESS_PENALTY, ge=0)
    required_points_to_win: int = Field(default=DEFAULT_REQUIRED_POINTS_TO_WIN, ge=1)
    filters: GameModeFiltersState = Field(default_factory=GameModeFiltersState)
    requires_phone_connections: bool = False


class CreateGameModePresetRequest(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    config: GameModePresetConfig


class CreateGameModePresetResponse(BaseModel):
    preset: GameModePresetState


class ValidateGameModeRequest(BaseModel):
    config: GameModePresetConfig


class ValidateGameModeResponse(BaseModel):
    valid: bool
    error: str | None = None
