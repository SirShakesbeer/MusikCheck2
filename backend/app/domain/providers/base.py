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


class MediaProvider(ABC):
    key: str

    @abstractmethod
    def fetch_items(self, source: str) -> list[MediaItem]:
        raise NotImplementedError
