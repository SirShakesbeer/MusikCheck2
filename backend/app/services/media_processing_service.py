import hashlib
from dataclasses import dataclass

from app.domain.game_modes.base import SnippetSpec
from app.domain.providers.base import MediaItem


SILENT_WAV_DATA_URI = (
    "data:audio/wav;base64,"
    "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA="
)


@dataclass
class ProcessedSnippet:
    cache_key: str
    snippet_url: str


class MediaProcessingService:
    def __init__(self) -> None:
        self._cache: dict[str, ProcessedSnippet] = {}

    def build_snippet(self, media_item: MediaItem, spec: SnippetSpec) -> ProcessedSnippet:
        fingerprint = f"{media_item.source_id}:{spec.kind}:{spec.duration_seconds}:{spec.random_start}"
        cache_key = hashlib.sha256(fingerprint.encode("utf-8")).hexdigest()[:16]
        if cache_key in self._cache:
            return self._cache[cache_key]

        snippet = ProcessedSnippet(cache_key=cache_key, snippet_url=SILENT_WAV_DATA_URI)
        self._cache[cache_key] = snippet
        return snippet
