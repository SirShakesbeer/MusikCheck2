import unittest
from types import SimpleNamespace

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.core.database import Base
from app.domain.providers.base import MediaItem
from app.domain.models import IndexedTrack, LobbySource, MediaSource, Team
from app.services.game_engine import GameEngine
from app.services.game_mode_service import GameModePreset, RoundTypeRule
from app.services.media_extraction_service import MediaExtractionService


class _StubModeService:
    def __init__(self, preset: GameModePreset):
        self._preset = preset

    def resolve(self, preset_key: str | None, mode_override: GameModePreset | None = None) -> GameModePreset:
        return mode_override or self._preset

    def pick_round_kind(self, preset: GameModePreset, song_number: int) -> str:
        return preset.round_rules[0].kind

    def mode_requires_phone_connections(self, preset: GameModePreset) -> bool:
        return False


class _StubMediaProcessingService:
    def __init__(self):
        self.calls = []

    def build_snippet(self, media_item, spec):
        return SimpleNamespace(cache_key="snippet", snippet_url="/api/media/snippets/snippet")

    def build_video_round_playback(
        self,
        media_item,
        stage_index,
        stage_duration,
        start_at_seconds,
        song_number,
        track_duration_seconds=None,
        frame_count=4,
    ):
        self.calls.append(
            {
                "stage_index": stage_index,
                "track_duration_seconds": track_duration_seconds,
                "frame_count": frame_count,
            }
        )
        if stage_index == 0:
            return {
                "mode": "single_frame",
                "frame_urls": ["/api/media/snippets/youtube-frame"],
                "frame_duration_ms": None,
                "clip_url": None,
                "clip_start_seconds": None,
                "clip_duration_seconds": None,
            }
        if stage_index == 1:
            return {
                "mode": "frame_loop",
                "frame_urls": ["/api/media/snippets/youtube-frame-1", "/api/media/snippets/youtube-frame-2"],
                "frame_duration_ms": 500,
                "clip_url": None,
                "clip_start_seconds": None,
                "clip_duration_seconds": None,
            }
        return None


class _StubMediaIngestionService:
    def import_from_source(self, provider_key: str, source: str):
        return []


class YouTubeFfmpegPlaybackTests(unittest.TestCase):
    def setUp(self) -> None:
        self._old_test_mode = settings.test_mode
        settings.test_mode = False

        self.engine = create_engine("sqlite:///:memory:", future=True)
        self.SessionLocal = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)
        Base.metadata.create_all(bind=self.engine)

        self.preset = GameModePreset(
            key="test_mode",
            name="Test Mode",
            stage_durations=[2, 5, 8],
            stage_points=[10, 6, 3],
            round_rules=[RoundTypeRule(kind="video", every_n_songs=1)],
            bonus_points_both=2,
            wrong_guess_penalty=5,
            required_points_to_win=20,
            filters={},
        )

        self.engine_service = GameEngine(
            mode_service=_StubModeService(self.preset),
            media_processing=_StubMediaProcessingService(),
            media_ingestion=_StubMediaIngestionService(),
        )

    def tearDown(self) -> None:
        settings.test_mode = self._old_test_mode

    def test_video_round_uses_video_playback_helper(self) -> None:
        with self.SessionLocal() as db:
            lobby = self.engine_service.create_lobby(db, preset_key=self.preset.key, mode_override=self.preset)

            source = MediaSource(provider_key="youtube_playlist", source_value="https://www.youtube.com/playlist?list=PL123")
            db.add(source)
            db.flush()

            db.add(
                LobbySource(
                    lobby_id=lobby.id,
                    source_id=source.id,
                    source_type="youtube_playlist",
                    source_value=source.source_value,
                )
            )
            db.add(
                IndexedTrack(
                    source_id=source.id,
                    file_path="abc123xyz89",
                    title="Song",
                    artist="Artist",
                    file_mtime=1,
                    file_size=1000,
                )
            )
            db.commit()

            self.engine_service.join_team(db, lobby.code, player_name="Alice", team_name="Team A")
            self.engine_service.start_round(db, lobby.code)
            state = self.engine_service.get_state(db, lobby.code)

            self.assertIsNotNone(state.current_round)
            assert state.current_round is not None
            self.assertEqual(state.current_round.video_playback.mode, "single_frame")
            self.assertEqual(state.current_round.video_playback.frame_urls[0], "/api/media/snippets/youtube-frame")

    def test_video_round_passes_track_duration_to_stage_one_playback(self) -> None:
        with self.SessionLocal() as db:
            lobby = self.engine_service.create_lobby(db, preset_key=self.preset.key, mode_override=self.preset)

            source = MediaSource(provider_key="youtube_playlist", source_value="https://www.youtube.com/playlist?list=PL123")
            db.add(source)
            db.flush()

            db.add(
                LobbySource(
                    lobby_id=lobby.id,
                    source_id=source.id,
                    source_type="youtube_playlist",
                    source_value=source.source_value,
                )
            )
            db.add(
                IndexedTrack(
                    source_id=source.id,
                    file_path="abc123xyz89",
                    title="Song",
                    artist="Artist",
                    file_mtime=1,
                    file_size=1000,
                )
            )
            db.commit()

            self.engine_service.join_team(db, lobby.code, player_name="Alice", team_name="Team A")
            self.engine_service.start_round(db, lobby.code)

            self.engine_service.get_state(db, lobby.code)

            self.assertTrue(self.engine_service.media_processing.calls)
            self.assertEqual(self.engine_service.media_processing.calls[0]["track_duration_seconds"], 1)


class _TimestampCaptureExtractionService(MediaExtractionService):
    def __init__(self):
        super().__init__()
        self.captured_start_seconds: list[float] = []

    def _ffmpeg_is_available(self) -> bool:
        return True

    def _resolve_youtube_stream_url(self, media_path: str | None, prefer_audio: bool = False) -> str | None:
        return "https://example.com/source"

    def _extract_youtube_frame_url(self, source_url: str, cache_key: str, start_seconds: float) -> str | None:
        self.captured_start_seconds.append(round(float(start_seconds), 3))
        return f"/api/media/snippets/{cache_key}"


class YouTubeFrameTimestampTests(unittest.TestCase):
    def test_second_snippet_uses_spread_random_timestamps(self) -> None:
        service = _TimestampCaptureExtractionService()
        media_item = MediaItem(
            source_id="track-1",
            title="Song",
            artist="Artist",
            media_path="https://youtube.com/watch?v=abc123xyz89",
        )

        playback = service.build_youtube_video_playback(
            media_item=media_item,
            stage_index=1,
            stage_duration=5,
            start_at_seconds=0,
            song_number=7,
            track_duration_seconds=240,
            frame_count=4,
        )

        self.assertIsNotNone(playback)
        self.assertEqual(len(service.captured_start_seconds), 4)
        self.assertTrue(all(left < right for left, right in zip(service.captured_start_seconds, service.captured_start_seconds[1:])))
        self.assertGreater(service.captured_start_seconds[-1] - service.captured_start_seconds[0], 100)
        self.assertNotAlmostEqual(
            service.captured_start_seconds[1] - service.captured_start_seconds[0],
            service.captured_start_seconds[2] - service.captured_start_seconds[1],
        )


if __name__ == "__main__":
    unittest.main()