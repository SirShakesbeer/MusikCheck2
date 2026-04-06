from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Optional, Any, Literal

from app.services.service_container import game_mode_service

router = APIRouter()

class RoundTypeOptionMetadata(BaseModel):
    name: str
    label: str
    description: Optional[str] = None
    type: Literal["int", "float", "str", "bool"]
    default: Any = None
    min: Optional[float] = None
    max: Optional[float] = None
    choices: Optional[List[Any]] = None

class RoundTypeMetadata(BaseModel):
    kind: str
    label: str
    description: Optional[str] = None
    options: List[RoundTypeOptionMetadata]

class RoundTypesMetadataState(BaseModel):
    round_types: List[RoundTypeMetadata]

class RoundTypesMetadataEnvelope(BaseModel):
    ok: bool
    data: RoundTypesMetadataState


@router.get("/round-types/metadata", response_model=RoundTypesMetadataEnvelope)
def get_round_types():
    available = game_mode_service.available_round_types()
    round_types: list[RoundTypeMetadata] = []

    for definition in available:
        kind = str(definition["kind"])
        label = str(definition["label"])
        options: list[RoundTypeOptionMetadata] = []

        if kind == "audio":
            options = [
                RoundTypeOptionMetadata(
                    name="snippet1Duration",
                    label="Snippet 1 duration (s)",
                    description="Duration for snippet stage 1.",
                    type="int",
                    default=12,
                    min=1,
                    max=120,
                ),
                RoundTypeOptionMetadata(
                    name="snippet1Points",
                    label="Snippet 1 points",
                    description="Points awarded for stage 1 guesses.",
                    type="int",
                    default=3,
                    min=0,
                    max=20,
                ),
                RoundTypeOptionMetadata(
                    name="snippet2Duration",
                    label="Snippet 2 duration (s)",
                    description="Duration for snippet stage 2.",
                    type="int",
                    default=7,
                    min=1,
                    max=120,
                ),
                RoundTypeOptionMetadata(
                    name="snippet2Points",
                    label="Snippet 2 points",
                    description="Points awarded for stage 2 guesses.",
                    type="int",
                    default=2,
                    min=0,
                    max=20,
                ),
                RoundTypeOptionMetadata(
                    name="snippet3Duration",
                    label="Snippet 3 duration (s)",
                    description="Duration for snippet stage 3.",
                    type="int",
                    default=4,
                    min=1,
                    max=120,
                ),
                RoundTypeOptionMetadata(
                    name="snippet3Points",
                    label="Snippet 3 points",
                    description="Points awarded for stage 3 guesses.",
                    type="int",
                    default=1,
                    min=0,
                    max=20,
                ),
            ]

        round_types.append(
            RoundTypeMetadata(
                kind=kind,
                label=label,
                description=None,
                options=options,
            )
        )

    return RoundTypesMetadataEnvelope(
        ok=True,
        data=RoundTypesMetadataState(round_types=round_types),
    )
