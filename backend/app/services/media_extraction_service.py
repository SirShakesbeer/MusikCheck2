from __future__ import annotations

import hashlib
import importlib
import random
import shutil
import subprocess
import time
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import parse_qs, urlparse

_YTDLP_CACHE: dict[str, tuple[float, str]] = {}

try:
    from mutagen import File as MutagenFile
except ImportError:  # pragma: no cover - runtime fallback when mutagen is unavailable
    MutagenFile = None

from app.core.config import settings
from app.domain.providers.base import MediaItem
from app.domain.snippets import SnippetSpec


class MediaExtractionService:
    def __init__(self, media_root: str | Path | None = None) -> None:
        self._media_root = Path(media_root or settings.media_root)
        self._snippet_root = self._media_root / settings.snippet_cache_root
        self._ffmpeg_binary = (settings.ffmpeg_binary or "ffmpeg").strip() or "ffmpeg"
        self._ytdlp_js_runtime = settings.ytdlp_js_runtime
        self._ytdlp_js_runtimes = settings.ytdlp_js_runtimes
        self._ytdlp_js_runtime_path = settings.ytdlp_js_runtime_path

    def is_local_media_path(self, media_path: str | None) -> bool:
        if not media_path:
            return False
        if media_path.startswith("http://") or media_path.startswith("https://"):
            return False
        if media_path.startswith("/api/"):
            return False
        return Path(media_path).expanduser().exists()

    def is_youtube_media_path(self, media_path: str | None) -> bool:
        return self.resolve_youtube_video_id(media_path) is not None

    def resolve_youtube_video_id(self, media_path: str | None) -> str | None:
        if not media_path:
            return None

        normalized = media_path.strip()
        if not normalized:
            return None
        if len(normalized) == 11 and all(char.isalnum() or char in "-_" for char in normalized):
            return normalized

        parsed = urlparse(normalized)
        if "youtube.com" in parsed.netloc:
            query = parse_qs(parsed.query)
            values = query.get("v")
            if values and values[0].strip():
                return values[0].strip()
            segments = [segment for segment in parsed.path.split("/") if segment]
            if segments and segments[0] in {"embed", "shorts"} and len(segments) > 1:
                return segments[1].strip()
        elif "youtu.be" in parsed.netloc:
            video_id = parsed.path.strip("/")
            if video_id:
                return video_id

        return None

    def build_local_snippet(self, media_item: MediaItem, spec: SnippetSpec, cache_key: str) -> str | None:
        if not self.is_local_media_path(media_item.media_path):
            return None

        if shutil.which(self._ffmpeg_binary) is None:
            return f"/api/media/tracks/{media_item.source_id}/stream"

        source_path = Path(media_item.media_path).expanduser()
        if not source_path.exists() or not source_path.is_file():
            return f"/api/media/tracks/{media_item.source_id}/stream"

        snippet_path = self._snippet_path(cache_key)
        if snippet_path.exists() and snippet_path.stat().st_size > 0:
            return self._snippet_url(cache_key)

        snippet_path.parent.mkdir(parents=True, exist_ok=True)
        duration_seconds = max(1, int(spec.duration_seconds))
        start_seconds = self._resolve_start_seconds(source_path, duration_seconds, cache_key, spec.random_start)

        command = [
            self._ffmpeg_binary,
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-ss",
            str(start_seconds),
            "-t",
            str(duration_seconds),
            "-i",
            str(source_path),
            "-vn",
            "-acodec",
            settings.ffmpeg_audio_codec,
            "-b:a",
            settings.ffmpeg_audio_bitrate,
            str(snippet_path),
        ]
        completed = subprocess.run(command, check=False, capture_output=True, text=True)
        if completed.returncode != 0 or not snippet_path.exists() or snippet_path.stat().st_size == 0:
            if snippet_path.exists():
                snippet_path.unlink(missing_ok=True)
            return f"/api/media/tracks/{media_item.source_id}/stream"

        return self._snippet_url(cache_key)

    def build_youtube_video_playback(
        self,
        media_item: MediaItem,
        stage_index: int,
        stage_duration: int,
        start_at_seconds: int,
        song_number: int,
        track_duration_seconds: int | None = None,
        frame_count: int = 4,
    ) -> dict | None:
        if not self.is_youtube_media_path(media_item.media_path):
            return None
        if not self._ffmpeg_is_available():
            return None

        video_id = self.resolve_youtube_video_id(media_item.media_path)
        source_url = self._resolve_youtube_stream_url(media_item.media_path, prefer_audio=(stage_index >= 2))
        if not video_id or not source_url:
            return None

        stage_index = max(0, int(stage_index))
        stage_duration = max(1, int(stage_duration))
        start_at_seconds = max(0, int(start_at_seconds))
        song_number = max(0, int(song_number))

        if stage_index == 0:
            cache_key = self.build_video_asset_cache_key(media_item, "frame", song_number, stage_index, start_at_seconds, 0)
            frame_url = self._extract_youtube_frame_url(source_url, cache_key, start_at_seconds)
            if not frame_url:
                return None
            return {
                "mode": "single_frame",
                "frame_urls": [frame_url],
                "frame_duration_ms": None,
                "clip_url": None,
                "clip_start_seconds": None,
                "clip_duration_seconds": None,
            }

        if stage_index == 1:
            frame_count = max(2, min(12, int(frame_count or 4)))
            video_duration_seconds = max(1, int(track_duration_seconds or stage_duration or 1))
            frame_timestamps = self._build_stage2_frame_timestamps(
                video_duration_seconds=video_duration_seconds,
                frame_count=frame_count,
                media_item=media_item,
                song_number=song_number,
                stage_duration=stage_duration,
                start_at_seconds=start_at_seconds,
            )
            frame_urls: list[str] = []
            for index, frame_start_seconds in enumerate(frame_timestamps):
                cache_key = self.build_video_asset_cache_key(
                    media_item,
                    "loop",
                    song_number,
                    stage_index,
                    start_at_seconds,
                    f"{frame_start_seconds:.3f}:{index}",
                )
                frame_url = self._extract_youtube_frame_url(
                    source_url,
                    cache_key,
                    frame_start_seconds,
                )
                if frame_url:
                    frame_urls.append(frame_url)

            if not frame_urls:
                return None

            return {
                "mode": "frame_loop",
                "frame_urls": frame_urls,
                "frame_duration_ms": 1500,
                "clip_url": None,
                "clip_start_seconds": None,
                "clip_duration_seconds": None,
            }

        clip_cache_key = self.build_video_asset_cache_key(media_item, "clip", song_number, stage_index, start_at_seconds, stage_duration)
        clip_url = self._extract_youtube_clip_url(source_url, clip_cache_key, start_at_seconds, stage_duration)
        if not clip_url:
            return None

        return {
            "mode": "video_clip",
            "frame_urls": [],
            "frame_duration_ms": None,
            "clip_url": clip_url,
            "clip_start_seconds": start_at_seconds,
            "clip_duration_seconds": stage_duration,
        }

    def resolve_snippet_path(self, cache_key: str) -> Path | None:
        snippet_path = self.resolve_cached_asset_path(cache_key)
        if snippet_path:
            return snippet_path
        return None

    def resolve_cached_asset_path(self, cache_key: str) -> Path | None:
        asset_root = self._snippet_root / cache_key[:2] / cache_key
        if not asset_root.exists():
            return None

        candidates = sorted(
            [path for path in asset_root.iterdir() if path.is_file()],
            key=lambda path: (path.suffix.lower(), path.name),
        )
        if not candidates:
            return None

        preferred_suffixes = [".jpg", ".jpeg", ".png", ".mp4", ".webm", ".mp3", ".m4a", ".aac", ".wav"]
        for suffix in preferred_suffixes:
            for candidate in candidates:
                if candidate.suffix.lower() == suffix:
                    return candidate
        return candidates[0]

    def build_cache_key(self, media_item: MediaItem, spec: SnippetSpec) -> str:
        fingerprint_parts = [
            media_item.source_id,
            spec.kind,
            str(int(spec.duration_seconds)),
            str(bool(spec.random_start)),
        ]
        if self.is_local_media_path(media_item.media_path):
            source_path = Path(media_item.media_path).expanduser()
            try:
                stat = source_path.stat()
                fingerprint_parts.extend(
                    [
                        str(source_path.resolve()),
                        str(int(stat.st_mtime)),
                        str(int(stat.st_size)),
                    ]
                )
            except OSError:
                fingerprint_parts.append(str(source_path))
        digest = hashlib.sha256("|".join(fingerprint_parts).encode("utf-8")).hexdigest()
        return digest[:16]

    def build_video_asset_cache_key(
        self,
        media_item: MediaItem,
        asset_kind: str,
        song_number: int,
        stage_index: int,
        start_at_seconds: int,
        variant_index: int | str,
    ) -> str:
        fingerprint_parts = [
            media_item.source_id,
            asset_kind,
            str(int(song_number)),
            str(int(stage_index)),
            str(int(start_at_seconds)),
            str(variant_index),
        ]
        digest = hashlib.sha256("|".join(fingerprint_parts).encode("utf-8")).hexdigest()
        return digest[:16]

    def _stable_int(self, raw_value: str) -> int:
        digest = hashlib.sha256(raw_value.encode("utf-8")).hexdigest()
        return int(digest[:12], 16)

    def _build_stage2_frame_timestamps(
        self,
        video_duration_seconds: int,
        frame_count: int,
        media_item: MediaItem,
        song_number: int,
        stage_duration: int,
        start_at_seconds: int,
    ) -> list[float]:
        total_duration = max(1, int(video_duration_seconds))
        frame_count = max(2, int(frame_count))
        if total_duration <= 1:
            return [0.0 for _ in range(frame_count)]

        seed_value = self._stable_int(
            f"{media_item.source_id}:{song_number}:s2:{total_duration}:{frame_count}:{stage_duration}:{start_at_seconds}"
        )
        rng = random.Random(seed_value)
        segment_length = total_duration / float(frame_count)
        timestamps: list[float] = []

        for index in range(frame_count):
            segment_start = segment_length * index
            segment_end = min(float(total_duration), segment_length * (index + 1))
            usable_window = segment_end - segment_start
            if usable_window <= 0:
                timestamps.append(round(min(segment_start, float(total_duration - 1)), 3))
                continue

            margin = min(2.0, max(0.25, usable_window * 0.15))
            lower_bound = min(segment_end, segment_start + margin)
            upper_bound = max(lower_bound, segment_end - margin)
            if upper_bound <= lower_bound:
                timestamps.append(round(min(segment_start, float(total_duration - 1)), 3))
                continue

            timestamps.append(round(rng.uniform(lower_bound, upper_bound), 3))

        return timestamps

    def _snippet_path(self, cache_key: str) -> Path:
        return self._asset_path(cache_key, ".mp3")

    def _asset_path(self, cache_key: str, extension: str) -> Path:
        return self._snippet_root / cache_key[:2] / cache_key / f"{cache_key}{extension}"

    def _snippet_url(self, cache_key: str) -> str:
        return f"/api/media/snippets/{cache_key}"

    def _resolve_start_seconds(self, source_path: Path, duration_seconds: int, cache_key: str, random_start: bool) -> int:
        if not random_start:
            return 0

        total_seconds = self._probe_duration_seconds(source_path)
        if total_seconds is None or total_seconds <= duration_seconds:
            return 0

        max_start = max(0, total_seconds - duration_seconds)
        if max_start == 0:
            return 0

        seed = int(hashlib.sha256(cache_key.encode("utf-8")).hexdigest()[:12], 16)
        return seed % (max_start + 1)

    def _probe_duration_seconds(self, source_path: Path) -> int | None:
        if MutagenFile is None:
            return None

        try:
            audio_file = MutagenFile(source_path)
        except Exception:
            return None

        info = getattr(audio_file, "info", None)
        length = getattr(info, "length", None)
        if length is None:
            return None

        try:
            return max(0, int(length))
        except (TypeError, ValueError):
            return None

    def _resolve_youtube_stream_url(self, media_path: str | None, prefer_audio: bool = False) -> str | None:
        if not media_path:
            return None

        cache_key = f"{media_path}_{prefer_audio}"
        cached = _YTDLP_CACHE.get(cache_key)
        if cached and time.time() < cached[0]:
            return cached[1]

        try:
            yt_dlp_module = importlib.import_module("yt_dlp")
            youtube_dl = getattr(yt_dlp_module, "YoutubeDL", None)
            if youtube_dl is None:
                return None

            ydl_opts: dict[str, str | bool] = {
                "quiet": True, 
                "noplaylist": True, 
                "skip_download": True,
            }
            # Only enable node js_runtimes if requested, and pass down properly structured dict
            # yt-dlp expects remote_components as a list in API or we just ignore the solver
            if self._ytdlp_js_runtime:
                ydl_opts["js_runtimes"] = {self._ytdlp_js_runtime: {}}
                ydl_opts["remote_components"] = ["ejs:github"]

            with youtube_dl(ydl_opts) as ydl:
                info = ydl.extract_info(media_path, download=False)
        except Exception as e:
            print(f"Exception resolving yt-dlp: {e}")
            return None

        if not isinstance(info, dict):
            return None

        formats = [entry for entry in (info.get("formats") or []) if isinstance(entry, dict) and entry.get("url")]
        if not formats:
            if info.get("url"):
                return str(info["url"])
            return None

        def _format_score(entry: dict) -> tuple[int, int, int]:
            has_video = 1 if str(entry.get("vcodec") or "none").lower() != "none" else 0
            has_audio = 1 if str(entry.get("acodec") or "none").lower() != "none" else 0
            ext_score = 1 if str(entry.get("ext") or "").lower() in {"mp4", "m4a", "webm", "mkv"} else 0
            return (
                has_audio if prefer_audio else has_video,
                has_video,
                has_audio,
                int(entry.get("height") or 0),
                int(entry.get("width") or 0),
                int(entry.get("fps") or 0),
                int(entry.get("tbr") or entry.get("abr") or 0),
                ext_score,
            )

        best_format = max(formats, key=_format_score)
        result_url = str(best_format.get("url") or "") or None
        
        if result_url:
            _YTDLP_CACHE[cache_key] = (time.time() + 3600, result_url)
            
        return result_url

    def _ffmpeg_is_available(self) -> bool:
        return shutil.which(self._ffmpeg_binary) is not None

    def _extract_youtube_frame_url(self, source_url: str, cache_key: str, start_seconds: float) -> str | None:
        asset_path = self._asset_path(cache_key, ".jpg")
        if asset_path.exists() and asset_path.stat().st_size > 0:
            return self._snippet_url(cache_key)

        asset_path.parent.mkdir(parents=True, exist_ok=True)
        command = [
            self._ffmpeg_binary,
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-ss",
            str(max(0.0, float(start_seconds))),
            "-i",
            source_url,
            "-frames:v",
            "1",
            "-q:v",
            "2",
            str(asset_path),
        ]
        completed = subprocess.run(command, check=False, capture_output=True, text=True)
        if completed.returncode != 0 or not asset_path.exists() or asset_path.stat().st_size == 0:
            if asset_path.exists():
                asset_path.unlink(missing_ok=True)
            return None
        return self._snippet_url(cache_key)

    def _extract_youtube_clip_url(self, source_url: str, cache_key: str, start_seconds: int, duration_seconds: int) -> str | None:
        asset_path = self._asset_path(cache_key, ".mp4")
        if asset_path.exists() and asset_path.stat().st_size > 0:
            return self._snippet_url(cache_key)

        asset_path.parent.mkdir(parents=True, exist_ok=True)
        command = [
            self._ffmpeg_binary,
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-ss",
            str(max(0, int(start_seconds))),
            "-t",
            str(max(1, int(duration_seconds))),
            "-i",
            source_url,
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "28",
            "-c:a",
            "aac",
            "-b:a",
            "96k",
            "-movflags",
            "+faststart",
            str(asset_path),
        ]
        completed = subprocess.run(command, check=False, capture_output=True, text=True)
        if completed.returncode != 0 or not asset_path.exists() or asset_path.stat().st_size == 0:
            if asset_path.exists():
                asset_path.unlink(missing_ok=True)
            return None
        return self._snippet_url(cache_key)

    def cleanup_stale_snippets(self, max_age_hours: int = 72) -> int:
        if not self._snippet_root.exists():
            return 0

        cutoff = datetime.utcnow() - timedelta(hours=max_age_hours)
        removed = 0
        for snippet_file in self._snippet_root.rglob("*.mp3"):
            try:
                if datetime.utcfromtimestamp(snippet_file.stat().st_mtime) >= cutoff:
                    continue
                snippet_file.unlink(missing_ok=True)
                removed += 1
            except OSError:
                continue
        return removed