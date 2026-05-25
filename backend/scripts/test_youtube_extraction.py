from __future__ import annotations

import argparse
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.domain.providers.base import MediaItem
from app.services.media_extraction_service import MediaExtractionService


def _parse_cache_key(result_url: str) -> str | None:
    marker = "/api/media/snippets/"
    if marker not in result_url:
        return None
    return result_url.rsplit("/", 1)[-1]


def main() -> int:
    parser = argparse.ArgumentParser(description="Test YouTube FFmpeg extraction against a single video URL")
    parser.add_argument("url", help="YouTube video URL or video id")
    parser.add_argument("--stage", type=int, default=1, choices=[1, 2, 3], help="Video round stage to test")
    parser.add_argument("--duration", type=int, default=8, help="Clip duration for stage 3 or frame window duration for testing")
    parser.add_argument("--start", type=int, default=0, help="Start offset in seconds")
    parser.add_argument("--song-number", type=int, default=1, help="Song number used in the cache key")
    parser.add_argument("--frames", type=int, default=4, help="Frame count for stage 2")
    parser.add_argument("--force", action="store_true", help="Force refresh by deleting existing cached assets")
    args = parser.parse_args()

    service = MediaExtractionService()
    media_item = MediaItem(source_id=args.url, title="Test", artist="Test", media_path=args.url)
    stage_index = max(0, min(2, args.stage - 1))

    print(f"input_url: {args.url}")
    print(f"youtube_video_id: {service.resolve_youtube_video_id(args.url)}")
    print(f"ffmpeg_available: {service._ffmpeg_is_available()}")
    print(f"ytdlp_js_runtime: {service._ytdlp_js_runtime}")

    if args.force:
        from app.domain.snippets import SnippetSpec
        stage_rules = [
            ("frame", 0, False),
            ("loop", 8, False), 
            ("clip", args.duration, False),
        ]
        kind, dur, rand = stage_rules[stage_index]
        spec = SnippetSpec(kind=kind, duration_seconds=dur, random_start=rand)
        if stage_index == 1:
            for frame_idx in range(args.frames):
                cache_key = service.build_video_asset_cache_key(media_item, kind, args.song_number, stage_index, args.start, frame_idx)
                asset_path = service.resolve_cached_asset_path(cache_key)
                if asset_path and asset_path.exists():
                    asset_path.unlink()
        else:
            cache_key = service.build_video_asset_cache_key(media_item, kind, args.song_number, stage_index, args.start, stage_index == 2 and args.duration or 0)
            asset_path = service.resolve_cached_asset_path(cache_key)
            if asset_path and asset_path.exists():
                asset_path.unlink()
        print("force_refresh: true (deleted cached assets)")

    direct_stream_url = service._resolve_youtube_stream_url(args.url, prefer_audio=(stage_index >= 2))
    print(f"direct_stream_resolved: {bool(direct_stream_url)}")
    if direct_stream_url:
        print(f"direct_stream_origin: {direct_stream_url.split('?', 1)[0]}")

    if not service._ffmpeg_is_available():
        print("playback_mode: fallback")
        print("extraction_status: ffmpeg_missing")
        return 1

    playback = service.build_youtube_video_playback(
        media_item=media_item,
        stage_index=stage_index,
        stage_duration=max(1, args.duration),
        start_at_seconds=max(0, args.start),
        song_number=max(1, args.song_number),
        frame_count=max(2, args.frames),
    )

    if not playback:
        print("playback_mode: fallback")
        print("extraction_status: failed")
        return 1

    print(f"mode: {playback['mode']}")
    print(f"frame_urls: {playback['frame_urls']}")
    print(f"clip_url: {playback['clip_url']}")

    first_asset = None
    if playback.get("frame_urls"):
        first_asset = playback["frame_urls"][0]
    elif playback.get("clip_url"):
        first_asset = playback["clip_url"]

    cache_key = _parse_cache_key(str(first_asset or ""))
    if cache_key:
        asset_path = service.resolve_cached_asset_path(cache_key)
        print(f"cache_key: {cache_key}")
        print(f"asset_path: {asset_path}")
        if asset_path and Path(asset_path).exists():
            print(f"asset_size_bytes: {Path(asset_path).stat().st_size}")
            print("extraction_status: success")
            return 0

    print("extraction_status: unresolved")
    print("Extraction returned a playback URL, but the cached file path could not be resolved.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
