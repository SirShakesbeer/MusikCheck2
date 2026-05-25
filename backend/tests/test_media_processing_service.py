import tempfile
import unittest
from pathlib import Path

from app.domain.providers.base import MediaItem
from app.domain.snippets import SnippetSpec
from app.services.media_processing_service import MediaProcessingService


class _FakeSnippetExtractor:
    def is_local_media_path(self, media_path: str | None) -> bool:
        return bool(media_path and Path(media_path).exists())

    def build_local_snippet(self, media_item: MediaItem, spec: SnippetSpec, cache_key: str) -> str | None:
        return f"/api/media/snippets/{cache_key}"

    def resolve_snippet_path(self, cache_key: str):
        return Path(tempfile.gettempdir()) / f"{cache_key}.mp3"


class MediaProcessingServiceTests(unittest.TestCase):
    def test_local_media_uses_snippet_extractor(self):
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as handle:
            media_path = Path(handle.name)

        try:
            service = MediaProcessingService(snippet_extraction_service=_FakeSnippetExtractor())
            result = service.build_snippet(
                MediaItem(source_id="track-1", title="Song", artist="Artist", media_path=str(media_path)),
                SnippetSpec(kind="audio", duration_seconds=12, random_start=True),
            )

            self.assertTrue(result.snippet_url.startswith("/api/media/snippets/"))
        finally:
            media_path.unlink(missing_ok=True)

    def test_remote_media_keeps_existing_youtube_logic(self):
        service = MediaProcessingService(snippet_extraction_service=_FakeSnippetExtractor())
        result = service.build_snippet(
            MediaItem(
                source_id="video-1",
                title="Video",
                artist="Channel",
                media_path="https://www.youtube.com/watch?v=abc123",
            ),
            SnippetSpec(kind="video", duration_seconds=12, random_start=False),
        )

        self.assertIn("youtube-nocookie.com/embed/abc123", result.snippet_url)


if __name__ == "__main__":
    unittest.main()