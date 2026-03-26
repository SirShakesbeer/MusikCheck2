import hashlib
from dataclasses import dataclass
from urllib.parse import parse_qs, urlparse

from app.core.config import settings
from app.domain.snippets import SnippetSpec
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

        if settings.test_mode:
            snippet_url = SILENT_WAV_DATA_URI
        else:
            snippet_url = self._resolve_real_snippet_url(media_item, cache_key, spec.random_start)
            if not snippet_url:
                # Fallback: provide detailed error info
                raise ValueError(
                    f"Unable to build snippet for media item. "
                    f"Title: {media_item.title}, Artist: {media_item.artist}, "
                    f"Path: {media_item.media_path}. "
                    f"Supported: YouTube URLs, /api/media/tracks/* paths, or spotify.com URLs. "
                    f"Enable TEST_MODE to use placeholder snippets."
                )

        snippet = ProcessedSnippet(cache_key=cache_key, snippet_url=snippet_url)
        self._cache[cache_key] = snippet
        return snippet

        snippet = ProcessedSnippet(cache_key=cache_key, snippet_url=snippet_url)
        self._cache[cache_key] = snippet
        return snippet

    def _resolve_real_snippet_url(self, media_item: MediaItem, cache_key: str, random_start: bool) -> str | None:
        if not media_item.media_path:
            return None

        # Local file API endpoint
        if media_item.media_path.startswith("/api/media/tracks/"):
            return media_item.media_path

        # YouTube video
        youtube_embed = self._youtube_embed_url(media_item.media_path, cache_key, random_start)
        if youtube_embed:
            return youtube_embed

        # Spotify track URI - will be played via Web Playback SDK
        if media_item.media_path.startswith("spotify:track:"):
            return media_item.media_path

        return None

    def _youtube_embed_url(self, media_path: str, cache_key: str, random_start: bool) -> str | None:
        parsed = urlparse(media_path)
        video_id: str | None = None

        if "youtube.com" in parsed.netloc:
            query = parse_qs(parsed.query)
            values = query.get("v")
            if values:
                video_id = values[0]
        elif "youtu.be" in parsed.netloc:
            video_id = parsed.path.strip("/")

        if not video_id:
            return None

        if random_start:
            random_offset_seed = int(cache_key, 16)
            start = random_offset_seed % 90
        else:
            start = 0

        return f"https://www.youtube.com/embed/{video_id}?autoplay=1&start={start}"
