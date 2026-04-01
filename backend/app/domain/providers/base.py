from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class MediaItem:
    source_id: str
    title: str
    artist: str
    media_path: str | None = None
    lyrics: str | None = None
    duration_seconds: int | None = None
    release_year: int | None = None


class MediaProvider(ABC):
    key: str

    def validate_source(self, source: str) -> bool:
        return bool((source or "").strip())

    def source_label(self, source: str) -> str | None:
        return None

    @abstractmethod
    def fetch_items(self, source: str) -> list[MediaItem]:
        raise NotImplementedError
