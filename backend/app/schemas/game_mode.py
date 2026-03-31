from pydantic import BaseModel, Field


class RoundTypeRuleState(BaseModel):
    kind: str = Field(min_length=1)
    every_n_songs: int = Field(ge=1)


class GameModeFiltersState(BaseModel):
    release_year_from: int | None = None
    release_year_to: int | None = None
    language: str | None = None


class GameModePresetConfig(BaseModel):
    stage_durations: list[int] = Field(min_length=1)
    stage_points: list[int] = Field(min_length=1)
    round_rules: list[RoundTypeRuleState] = Field(min_length=1)
    bonus_points_both: int = Field(default=1, ge=0)
    wrong_guess_penalty: int = Field(default=0, ge=0)
    required_points_to_win: int = Field(default=15, ge=1)
    filters: GameModeFiltersState = Field(default_factory=GameModeFiltersState)


class GameModePresetState(BaseModel):
    key: str
    name: str
    stage_durations: list[int]
    stage_points: list[int]
    round_rules: list[RoundTypeRuleState]
    bonus_points_both: int = Field(default=1, ge=0)
    wrong_guess_penalty: int = Field(default=0, ge=0)
    required_points_to_win: int = Field(default=15, ge=1)
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
