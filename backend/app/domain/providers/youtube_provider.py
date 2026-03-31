from __future__ import annotations

import json
import re
from urllib.parse import parse_qs, urlencode, urlparse
from urllib.request import urlopen
from urllib.error import HTTPError, URLError

from app.core.config import settings
from app.domain.providers.base import MediaItem, MediaProvider


class YouTubePlaylistProvider(MediaProvider):
    key = "youtube_playlist"

    def validate_source(self, source: str) -> bool:
        return self._extract_playlist_id(source) is not None

    def source_label(self, source: str) -> str | None:
        normalized = (source or "").strip()
        if not normalized:
            return None
        if normalized.startswith("http://") or normalized.startswith("https://"):
            return None
        return normalized

    def fetch_items(self, source: str) -> list[MediaItem]:
        if not settings.youtube_api_key:
            raise ValueError("YouTube API key is not configured")

        playlist_id = self._extract_playlist_id(source)
        if not playlist_id:
            raise ValueError("Invalid YouTube playlist source")

        items: list[MediaItem] = []
        page_token: str | None = None
        while True:
            params = {
                "part": "snippet,contentDetails",
                "playlistId": playlist_id,
                "maxResults": "50",
                "key": settings.youtube_api_key,
            }
            if page_token:
                params["pageToken"] = page_token

            url = f"https://www.googleapis.com/youtube/v3/playlistItems?{urlencode(params)}"
            try:
                with urlopen(url, timeout=15) as response:
                    payload = json.loads(response.read().decode("utf-8"))
            except HTTPError as error:
                detail = self._build_http_error_detail(error)
                raise ValueError(detail) from error
            except URLError as error:
                raise ValueError(f"YouTube API request failed: {error}") from error

            for raw_item in payload.get("items", []):
                snippet = raw_item.get("snippet", {})
                details = raw_item.get("contentDetails", {})
                video_id = details.get("videoId")
                if not video_id:
                    continue

                title = str(snippet.get("title") or "Unknown Title")
                artist = str(
                    snippet.get("videoOwnerChannelTitle")
                    or snippet.get("channelTitle")
                    or "Unknown Artist"
                )
                items.append(
                    MediaItem(
                        source_id=f"yt:{playlist_id}:{video_id}",
                        title=title,
                        artist=artist,
                        media_path=f"https://www.youtube.com/watch?v={video_id}",
                    )
                )

            page_token = payload.get("nextPageToken")
            if not page_token:
                break

        return items

    def _extract_playlist_id(self, source: str) -> str | None:
        source = source.strip()
        parsed = urlparse(source)

        if not parsed.scheme:
            return source

        if "youtube.com" not in parsed.netloc and "youtu.be" not in parsed.netloc:
            return None

        query = parse_qs(parsed.query)
        playlist_ids = query.get("list")
        if playlist_ids and playlist_ids[0].strip():
            return playlist_ids[0].strip()

        return None

    def fetch_video_durations(self, video_ids: list[str]) -> dict[str, int]:
        valid_ids = [value.strip() for value in video_ids if value and value.strip()]
        if not valid_ids:
            return {}
        if not settings.youtube_api_key:
            raise ValueError("YouTube API key is not configured")

        durations: dict[str, int] = {}
        for start in range(0, len(valid_ids), 50):
            batch = valid_ids[start : start + 50]
            params = {
                "part": "contentDetails",
                "id": ",".join(batch),
                "maxResults": "50",
                "key": settings.youtube_api_key,
            }
            url = f"https://www.googleapis.com/youtube/v3/videos?{urlencode(params)}"

            try:
                with urlopen(url, timeout=15) as response:
                    payload = json.loads(response.read().decode("utf-8"))
            except HTTPError as error:
                detail = self._build_http_error_detail(error)
                raise ValueError(detail) from error
            except URLError as error:
                raise ValueError(f"YouTube API request failed: {error}") from error

            for raw_item in payload.get("items", []):
                video_id = str(raw_item.get("id") or "")
                if not video_id:
                    continue
                iso_duration = str(raw_item.get("contentDetails", {}).get("duration") or "")
                parsed_seconds = self._parse_iso8601_duration(iso_duration)
                if parsed_seconds is not None:
                    durations[video_id] = parsed_seconds

        return durations

    def _parse_iso8601_duration(self, value: str) -> int | None:
        match = re.match(r"^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$", value)
        if not match:
            return None

        hours = int(match.group(1) or 0)
        minutes = int(match.group(2) or 0)
        seconds = int(match.group(3) or 0)
        return hours * 3600 + minutes * 60 + seconds

    def _build_http_error_detail(self, error: HTTPError) -> str:
        raw_body = ""
        try:
            raw_body = error.read().decode("utf-8", errors="replace")
        except Exception:
            raw_body = ""

        reason = ""
        message = ""
        if raw_body:
            try:
                payload = json.loads(raw_body)
                message = str(payload.get("error", {}).get("message") or "")
                errors = payload.get("error", {}).get("errors") or []
                if errors and isinstance(errors, list):
                    reason = str(errors[0].get("reason") or "")
            except (TypeError, ValueError, KeyError):
                pass

        detail_parts = [f"YouTube API request failed: HTTP {error.code}"]
        if reason:
            detail_parts.append(f"reason={reason}")
        if message:
            detail_parts.append(message)

        detail = " | ".join(detail_parts)
        if error.code == 403:
            hint = (
                "Check that YouTube Data API v3 is enabled, the key is valid, key restrictions allow this backend "
                "(IP/app restrictions), quota is available, and the playlist is publicly accessible."
            )
            detail = f"{detail}. {hint}"

        return detail
