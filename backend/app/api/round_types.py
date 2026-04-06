from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Optional, Any, Literal

from app.core.defaults import ROUND_TYPE_OPTION_DEFINITIONS
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
        raw_options = ROUND_TYPE_OPTION_DEFINITIONS.get(kind, ())
        options = [RoundTypeOptionMetadata(**item) for item in raw_options]

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
