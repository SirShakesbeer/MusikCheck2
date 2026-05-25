import hashlib
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from app.core.config import settings
from app.domain.snippets import SnippetSpec
from app.domain.providers.base import MediaItem
from app.services.media_extraction_service import MediaExtractionService


SILENT_WAV_DATA_URI = (
    "data:audio/wav;base64,"
    "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA="
)


@dataclass
class ProcessedSnippet:
    cache_key: str
    snippet_url: str


class MediaProcessingService:
    def __init__(self, snippet_extraction_service: MediaExtractionService | None = None) -> None:
        self._cache: dict[str, ProcessedSnippet] = {}
        self._snippet_extraction_service = snippet_extraction_service or MediaExtractionService()

    def build_snippet(self, media_item: MediaItem, spec: SnippetSpec) -> ProcessedSnippet:
        fingerprint = self._build_fingerprint(media_item, spec)
        cache_key = hashlib.sha256(fingerprint.encode("utf-8")).hexdigest()[:16]
        if cache_key in self._cache:
            return self._cache[cache_key]

        if settings.test_mode:
            snippet_url = SILENT_WAV_DATA_URI
        else:
            snippet_url = self._resolve_real_snippet_url(media_item, cache_key, spec)
            if not snippet_url:
                raise ValueError(
                    "Unable to build a real snippet URL for this media item while TEST_MODE is disabled."
                )

        snippet = ProcessedSnippet(cache_key=cache_key, snippet_url=snippet_url)
        self._cache[cache_key] = snippet
        return snippet

    def _resolve_real_snippet_url(self, media_item: MediaItem, cache_key: str, spec: SnippetSpec) -> str | None:
        if not media_item.media_path:
            return None

        if self._snippet_extraction_service.is_local_media_path(media_item.media_path):
            snippet_url = self._snippet_extraction_service.build_local_snippet(media_item, spec, cache_key)
            if snippet_url:
                return snippet_url

        if media_item.media_path.startswith("/api/media/tracks/"):
            return media_item.media_path

        if "open.spotify.com/track/" in media_item.media_path:
            return media_item.media_path

        youtube_embed = self._youtube_embed_url(media_item.media_path, cache_key, spec.random_start)
        if youtube_embed:
            return youtube_embed

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
            return f"https://www.youtube-nocookie.com/embed/{video_id}?autoplay=1&start={start}"

        # Keep base embed URL without explicit start so stage-specific offsets can be applied by playback state.
        return f"https://www.youtube-nocookie.com/embed/{video_id}?autoplay=1"

    def get_cached_snippet_path(self, cache_key: str) -> Path | None:
        return self._snippet_extraction_service.resolve_snippet_path(cache_key)

    def build_video_round_playback(
        self,
        media_item: MediaItem,
        stage_index: int,
        stage_duration: int,
        start_at_seconds: int,
        song_number: int,
        track_duration_seconds: int | None = None,
        frame_count: int = 4,
    ) -> dict | None:
        return self._snippet_extraction_service.build_youtube_video_playback(
            media_item=media_item,
            stage_index=stage_index,
            stage_duration=stage_duration,
            start_at_seconds=start_at_seconds,
            song_number=song_number,
            track_duration_seconds=track_duration_seconds,
            frame_count=frame_count,
        )

    def _build_fingerprint(self, media_item: MediaItem, spec: SnippetSpec) -> str:
        parts = [media_item.source_id, spec.kind, str(spec.duration_seconds), str(spec.random_start)]
        if media_item.media_path and self._snippet_extraction_service.is_local_media_path(media_item.media_path):
            local_path = Path(media_item.media_path).expanduser()
            try:
                stat = local_path.stat()
                parts.extend([str(local_path.resolve()), str(int(stat.st_mtime)), str(int(stat.st_size))])
            except OSError:
                parts.append(str(local_path))
        return ":".join(parts)
