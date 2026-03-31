from __future__ import annotations

from dataclasses import dataclass, field

from app.services.game_mode_service import GameModePreset


@dataclass(frozen=True)
class RoundSourceCapabilities:
    required_provider_keys: dict[str, set[str]] = field(
        default_factory=lambda: {
            "video": {"youtube_playlist", "local_folder", "local_files"},
        }
    )


class RoundTypeSourceResolver:
    def allowed_provider_keys(self, mode: GameModePreset, round_kind: str) -> set[str] | None:
        raise NotImplementedError()


class DefaultRoundTypeSourceResolver(RoundTypeSourceResolver):
    def __init__(self, capabilities: RoundSourceCapabilities | None = None) -> None:
        self._capabilities = capabilities or RoundSourceCapabilities()

    def allowed_provider_keys(self, mode: GameModePreset, round_kind: str) -> set[str] | None:
        normalized_kind = (round_kind or "audio").strip().lower()

        configured = self._from_mode_filters(mode, normalized_kind)
        if configured is not None:
            return configured

        default_required = self._capabilities.required_provider_keys.get(normalized_kind)
        if default_required:
            return set(default_required)

        return None

    def _from_mode_filters(self, mode: GameModePreset, round_kind: str) -> set[str] | None:
        mapping = mode.filters.get("round_source_provider_map") if isinstance(mode.filters, dict) else None
        if not isinstance(mapping, dict):
            return None

        raw_values = mapping.get(round_kind)
        if not isinstance(raw_values, list):
            return None

        normalized = {
            str(value).strip().lower()
            for value in raw_values
            if str(value).strip()
        }
        return normalized if normalized else set()
