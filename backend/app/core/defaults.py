from dataclasses import dataclass


@dataclass(frozen=True)
class RoundTypeDefinition:
    kind: str
    label: str
    requires_phone_connections: bool = False
    default_every_n_songs: int = 1


DEFAULT_PRESET_KEY = "classic_audio"
DEFAULT_MODE_TITLE = "Game Mode Details"

DEFAULT_BONUS_POINTS_BOTH = 1
DEFAULT_WRONG_GUESS_PENALTY = 1
DEFAULT_REQUIRED_POINTS_TO_WIN = 42

ROUND_TYPE_DEFINITIONS: tuple[RoundTypeDefinition, ...] = (
    RoundTypeDefinition(kind="audio", label="Audio rounds", default_every_n_songs=1),
    RoundTypeDefinition(kind="video", label="Video rounds", default_every_n_songs=4),
    RoundTypeDefinition(kind="lyrics", label="Lyrics rounds", requires_phone_connections=True, default_every_n_songs=6),
)

ROUND_TYPE_PHONE_REQUIREMENTS: dict[str, bool] = {
    definition.kind: definition.requires_phone_connections for definition in ROUND_TYPE_DEFINITIONS
}

DEFAULT_PLAYBACK_PROVIDER = "local_files"
DEFAULT_TRACK_DURATION_SECONDS = 240
DEFAULT_SNIPPET_START_OFFSETS = "0,0,0"