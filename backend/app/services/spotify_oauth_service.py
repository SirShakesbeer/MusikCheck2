from __future__ import annotations

import base64
import json
import random
import secrets
import time
from dataclasses import dataclass
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from app.core.config import settings


@dataclass
class SpotifyToken:
    access_token: str
    refresh_token: str | None
    expires_at: float


class SpotifyOAuthService:
    def __init__(self) -> None:
        self._token: SpotifyToken | None = None
        self._valid_states: dict[str, float] = {}

    def auth_url(self) -> str:
        if not settings.spotify_client_id:
            raise ValueError("Spotify client credentials are not configured")

        state = secrets.token_urlsafe(24)
        self._valid_states[state] = time.time() + 900
        params = {
            "client_id": settings.spotify_client_id,
            "response_type": "code",
            "redirect_uri": settings.spotify_redirect_uri,
            "scope": settings.spotify_scopes,
            "state": state,
            "show_dialog": "true",
        }
        return f"https://accounts.spotify.com/authorize?{urlencode(params)}"

    def exchange_code(self, code: str, state: str | None) -> None:
        if not state or state not in self._valid_states or self._valid_states[state] < time.time():
            raise ValueError("Invalid or expired Spotify OAuth state")
        del self._valid_states[state]

        payload = self._token_request(
            {
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": settings.spotify_redirect_uri,
            }
        )
        self._save_token(payload)

    def status(self) -> tuple[bool, int | None]:
        if not self._token:
            return False, None
        remaining = int(max(0, self._token.expires_at - time.time()))
        return True, remaining

    def play_track_random(
        self,
        track_id: str,
        track_duration_seconds: int,
        snippet_duration_seconds: int,
        device_id: str | None = None,
        start_at_seconds: int | None = None,
    ) -> int:
        if not track_id:
            raise ValueError("Spotify track_id is required")

        token = self._get_access_token()
        resolved_device_id = device_id
        if device_id:
            resolved_device_id = self._wait_for_device(token, device_id)
        
        # Use provided start time or generate random if not specified
        if start_at_seconds is not None:
            position_ms = max(0, int(start_at_seconds)) * 1000
        else:
            max_start_seconds = max(0, int(track_duration_seconds) - int(snippet_duration_seconds))
            random_start_seconds = random.randint(0, max_start_seconds) if max_start_seconds > 0 else 0
            position_ms = random_start_seconds * 1000

        self._spotify_put(
            "https://api.spotify.com/v1/me/player/play"
            + (f"?device_id={resolved_device_id}" if resolved_device_id else ""),
            token,
            {
                "uris": [f"spotify:track:{track_id}"],
                "position_ms": position_ms,
            },
        )
        return position_ms

    def activate_device(self, device_id: str) -> None:
        if not device_id:
            raise ValueError("Spotify device_id is required")

        token = self._get_access_token()
        resolved_device_id = self._wait_for_device(token, device_id)
        self._spotify_put(
            "https://api.spotify.com/v1/me/player",
            token,
            {
                "device_ids": [resolved_device_id],
                "play": False,
            },
        )

    def access_token(self) -> str:
        return self._get_access_token()

    def _get_access_token(self) -> str:
        if not self._token:
            raise ValueError("Spotify is not connected. Connect your account first.")

        if self._token.expires_at <= time.time() + 10:
            if not self._token.refresh_token:
                raise ValueError("Spotify token expired and no refresh token is available. Reconnect Spotify.")
            payload = self._token_request(
                {
                    "grant_type": "refresh_token",
                    "refresh_token": self._token.refresh_token,
                }
            )
            self._save_token(payload, fallback_refresh_token=self._token.refresh_token)

        if not self._token:
            raise ValueError("Spotify token is unavailable")
        return self._token.access_token

    def _token_request(self, data: dict[str, str]) -> dict:
        if not settings.spotify_client_id or not settings.spotify_client_secret:
            raise ValueError("Spotify client credentials are not configured")

        credentials = f"{settings.spotify_client_id}:{settings.spotify_client_secret}".encode("utf-8")
        auth_header = base64.b64encode(credentials).decode("utf-8")
        body = urlencode(data).encode("utf-8")
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
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            raise ValueError(f"Spotify token request failed: HTTP {error.code}") from error
        except URLError as error:
            raise ValueError(f"Spotify token request failed: {error}") from error

    def _save_token(self, payload: dict, fallback_refresh_token: str | None = None) -> None:
        access_token = str(payload.get("access_token") or "")
        if not access_token:
            raise ValueError("Spotify token response did not include access_token")

        expires_in = int(payload.get("expires_in") or 3600)
        refresh_token = payload.get("refresh_token") or fallback_refresh_token
        self._token = SpotifyToken(
            access_token=access_token,
            refresh_token=str(refresh_token) if refresh_token else None,
            expires_at=time.time() + expires_in,
        )

    def _spotify_put(self, url: str, access_token: str, body: dict) -> None:
        request = Request(
            url=url,
            data=json.dumps(body).encode("utf-8"),
            method="PUT",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
        )

        try:
            with urlopen(request, timeout=15):
                return
        except HTTPError as error:
            detail = self._extract_spotify_error_detail(error)
            if error.code == 401:
                raise ValueError("Spotify authorization expired. Reconnect your account.") from error
            if error.code == 404:
                raise ValueError(
                    "No active Spotify playback device found. Open Spotify on a device first."
                    + (f" ({detail})" if detail else "")
                ) from error
            if error.code == 403:
                raise ValueError(
                    "Spotify playback forbidden. Premium account and playback scopes are required."
                    + (f" ({detail})" if detail else "")
                ) from error
            raise ValueError(
                f"Spotify playback request failed: HTTP {error.code}" + (f" ({detail})" if detail else "")
            ) from error
        except URLError as error:
            raise ValueError(f"Spotify playback request failed: {error}") from error

    def _spotify_get(self, url: str, access_token: str) -> dict[str, Any]:
        request = Request(
            url=url,
            method="GET",
            headers={
                "Authorization": f"Bearer {access_token}",
            },
        )

        try:
            with urlopen(request, timeout=15) as response:
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            detail = self._extract_spotify_error_detail(error)
            if error.code == 401:
                raise ValueError("Spotify authorization expired. Reconnect your account.") from error
            raise ValueError(
                f"Spotify API request failed: HTTP {error.code}" + (f" ({detail})" if detail else "")
            ) from error
        except URLError as error:
            raise ValueError(f"Spotify API request failed: {error}") from error

    def _wait_for_device(self, access_token: str, device_id: str, timeout_seconds: float = 10.0) -> str:
        started = time.time()
        latest_devices: list[dict[str, Any]] = []
        last_error: str | None = None
        
        while time.time() - started < timeout_seconds:
            try:
                payload = self._spotify_get("https://api.spotify.com/v1/me/player/devices", access_token)
                devices = payload.get("devices")
                latest_devices = devices if isinstance(devices, list) else []
                
                for device in latest_devices:
                    candidate_id = str(device.get("id") or "")
                    if candidate_id and candidate_id == device_id:
                        return candidate_id

                for device in latest_devices:
                    candidate_id = str(device.get("id") or "")
                    device_name = str(device.get("name") or "")
                    if candidate_id and device_name == "MusikCheck2 Browser Player":
                        return candidate_id
            except Exception as e:
                last_error = str(e)
            
            time.sleep(0.5)

        labels = [str(device.get("name") or "Unknown") for device in latest_devices if isinstance(device, dict)]
        active_devices = ", ".join(labels[:5]) if labels else "none"
        
        suggestion = "Close any other Spotify apps/browser tabs, ensure Premium is active, and keep this page open."
        if any("Web Player" in str(d.get("name", "")) for d in latest_devices):
            suggestion = "You have another Spotify Web Player active. Close it and try again."
        
        raise ValueError(
            f"Spotify browser device '{device_id}' not available. {suggestion} "
            f"Active devices: {active_devices}."
        )

    def _extract_spotify_error_detail(self, error: HTTPError) -> str:
        try:
            raw = error.read().decode("utf-8", errors="replace")
            payload = json.loads(raw)
            err = payload.get("error")
            if isinstance(err, dict):
                message = str(err.get("message") or "").strip()
                reason = str(err.get("reason") or "").strip()
                if message and reason:
                    return f"{reason}: {message}"
                if message:
                    return message
                if reason:
                    return reason
            if isinstance(err, str):
                return err.strip()
            return raw.strip()
        except Exception:
            return ""
