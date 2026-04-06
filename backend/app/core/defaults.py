from dataclasses import dataclass
from typing import Any


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

# Shared option metadata used by both API exposure and backend validation.
ROUND_TYPE_OPTION_DEFINITIONS: dict[str, tuple[dict[str, Any], ...]] = {
    "audio": (
        {
            "name": "snippet1Duration",
            "label": "Snippet 1 duration (s)",
            "description": "Duration for snippet stage 1.",
            "type": "int",
            "default": 12,
            "min": 1,
            "max": 120,
        },
        {
            "name": "snippet2Duration",
            "label": "Snippet 2 duration (s)",
            "description": "Duration for snippet stage 2.",
            "type": "int",
            "default": 7,
            "min": 1,
            "max": 120,
        },
        {
            "name": "snippet3Duration",
            "label": "Snippet 3 duration (s)",
            "description": "Duration for snippet stage 3.",
            "type": "int",
            "default": 4,
            "min": 1,
            "max": 120,
        },
        {
            "name": "snippet1Points",
            "label": "Snippet 1 points",
            "description": "Points awarded for stage 1 guesses.",
            "type": "int",
            "default": 3,
            "min": 0,
            "max": 20,
        },
        {
            "name": "snippet2Points",
            "label": "Snippet 2 points",
            "description": "Points awarded for stage 2 guesses.",
            "type": "int",
            "default": 2,
            "min": 0,
            "max": 20,
        },
        {
            "name": "snippet3Points",
            "label": "Snippet 3 points",
            "description": "Points awarded for stage 3 guesses.",
            "type": "int",
            "default": 1,
            "min": 0,
            "max": 20,
        },
    ),
    "video": (),
    "lyrics": (),
}

DEFAULT_PLAYBACK_PROVIDER = "local_files"
DEFAULT_TRACK_DURATION_SECONDS = 240
DEFAULT_SNIPPET_START_OFFSETS = "0,0,0"