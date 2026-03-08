from abc import ABC, abstractmethod
from dataclasses import dataclass

from app.domain.providers.base import MediaItem


@dataclass
class SnippetSpec:
    kind: str
    duration_seconds: int
    random_start: bool = True


class GameModePlugin(ABC):
    key: str
    display_name: str

    @property
    @abstractmethod
    def stage_durations(self) -> list[int]:
        raise NotImplementedError

    @property
    @abstractmethod
    def stage_points(self) -> list[int]:
        raise NotImplementedError

    @property
    @abstractmethod
    def ui_config(self) -> dict:
        raise NotImplementedError

    @abstractmethod
    def snippet_for_stage(self, media_item: MediaItem, stage_index: int) -> SnippetSpec:
        raise NotImplementedError

    @abstractmethod
    def is_guess_correct(self, media_item: MediaItem, title_guess: str, artist_guess: str) -> bool:
        raise NotImplementedError
