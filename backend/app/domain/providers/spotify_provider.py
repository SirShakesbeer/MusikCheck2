from __future__ import annotations

import base64
import json
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen

from app.core.config import settings
from app.domain.providers.base import MediaItem, MediaProvider


class SpotifyPlaylistProvider(MediaProvider):
    key = "spotify_playlist"

    def fetch_items(self, source: str) -> list[MediaItem]:
        playlist_id = self._extract_playlist_id(source)
        if not playlist_id:
            raise ValueError("Invalid Spotify playlist source")

        access_token = self._fetch_access_token()

        items: list[MediaItem] = []
        next_url = (
            f"https://api.spotify.com/v1/playlists/{playlist_id}/tracks"
            "?fields=items(track(id,name,duration_ms,artists(name),external_urls(spotify))),next&limit=100"
        )
        while next_url:
            payload = self._spotify_get(next_url, access_token)
            for entry in payload.get("items", []):
                track = entry.get("track") or {}
                track_id = str(track.get("id") or "").strip()
                if not track_id:
                    continue

                title = str(track.get("name") or "Unknown Title")
                artists = track.get("artists") or []
                artist_names = [str(artist.get("name") or "").strip() for artist in artists if artist.get("name")]
                artist = ", ".join([name for name in artist_names if name]) or "Unknown Artist"
                duration_ms = int(track.get("duration_ms") or 0)
                external_url = str((track.get("external_urls") or {}).get("spotify") or "").strip()

                items.append(
                    MediaItem(
                        source_id=f"sp:{playlist_id}:{track_id}",
                        title=title,
                        artist=artist,
                        media_path=external_url or f"https://open.spotify.com/track/{track_id}",
                        duration_seconds=(duration_ms // 1000) if duration_ms > 0 else None,
                    )
                )

            next_url = payload.get("next")

        return items

    def _extract_playlist_id(self, source: str) -> str | None:
        source = source.strip()
        parsed = urlparse(source)
        if not parsed.scheme:
            return source or None

        if parsed.scheme == "spotify":
            uri_parts = [segment for segment in source.split(":") if segment]
            if len(uri_parts) >= 3 and uri_parts[1] == "playlist":
                return uri_parts[2]
            return None

        if "spotify.com" not in parsed.netloc:
            return None

        parts = [segment for segment in parsed.path.split("/") if segment]
        if not parts:
            return None

        if parts[0] == "playlist" and len(parts) >= 2:
            return parts[1]

        if "playlist" in parts:
            playlist_index = parts.index("playlist")
            if playlist_index + 1 < len(parts):
                return parts[playlist_index + 1]

        return None

    def _fetch_access_token(self) -> str:
        if not settings.spotify_client_id or not settings.spotify_client_secret:
            raise ValueError("Spotify client credentials are not configured")

        credentials = f"{settings.spotify_client_id}:{settings.spotify_client_secret}".encode("utf-8")
        auth_header = base64.b64encode(credentials).decode("utf-8")
        body = urlencode({"grant_type": "client_credentials"}).encode("utf-8")
        request = Request(
            url="https://accounts.spotify.com/api/token",
            data=body,
            method="POST",
            headers={
                "Authorization": f"Basic {auth_header}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
        )

        try:
            with urlopen(request, timeout=15) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            raise ValueError(f"Spotify token request failed: HTTP {error.code}") from error
        except URLError as error:
            raise ValueError(f"Spotify token request failed: {error}") from error

        token = str(payload.get("access_token") or "")
        if not token:
            raise ValueError("Spotify token response did not include access_token")
        return token

    def _spotify_get(self, url: str, access_token: str) -> dict:
        request = Request(
            url=url,
            method="GET",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        try:
            with urlopen(request, timeout=15) as response:
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            if error.code == 404:
                raise ValueError(
                    "Spotify playlist was not found or is not accessible with client-credentials. "
                    "Use a valid public playlist URL/ID, or connect Spotify OAuth for user-scoped access."
                ) from error
            raise ValueError(f"Spotify API request failed: HTTP {error.code}") from error
        except URLError as error:
            raise ValueError(f"Spotify API request failed: {error}") from error
