from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from app.core.defaults import (
    DEFAULT_BONUS_POINTS_BOTH,
    DEFAULT_PRESET_KEY,
    DEFAULT_REQUIRED_POINTS_TO_WIN,
    DEFAULT_WRONG_GUESS_PENALTY,
    ROUND_TYPE_PHONE_REQUIREMENTS,
)


@dataclass
class RoundTypeRule:
    kind: str
    every_n_songs: int


@dataclass
class GameModePreset:
    key: str
    name: str
    stage_durations: list[int]
    stage_points: list[int]
    round_rules: list[RoundTypeRule]
    bonus_points_both: int = DEFAULT_BONUS_POINTS_BOTH
    wrong_guess_penalty: int = DEFAULT_WRONG_GUESS_PENALTY
    required_points_to_win: int = DEFAULT_REQUIRED_POINTS_TO_WIN
    filters: dict[str, Any] = field(default_factory=dict)

    def validate(self) -> None:
        if not self.key.strip():
            raise ValueError("Game mode key is required")
        if not self.name.strip():
            raise ValueError("Game mode name is required")
        if len(self.stage_durations) < 1:
            raise ValueError("At least one stage duration is required")
        if len(self.stage_durations) != len(self.stage_points):
            raise ValueError("stage_durations and stage_points must have equal lengths")
        if any(value < 1 for value in self.stage_durations):
            raise ValueError("All stage durations must be >= 1")
        if any(value < 0 for value in self.stage_points):
            raise ValueError("All stage points must be >= 0")
        if self.bonus_points_both < 0:
            raise ValueError("bonus_points_both must be >= 0")
        if self.wrong_guess_penalty < 0:
            raise ValueError("wrong_guess_penalty must be >= 0")
        if self.required_points_to_win < 1:
            raise ValueError("required_points_to_win must be >= 1")
        if len(self.round_rules) < 1:
            raise ValueError("At least one round rule is required")

        normalized_rules: list[RoundTypeRule] = []
        seen_kinds: set[str] = set()
        for rule in self.round_rules:
            kind = rule.kind.strip().lower()
            if not kind:
                raise ValueError("Round rule kind is required")
            if rule.every_n_songs < 1:
                raise ValueError(f"Frequency for '{kind}' must be >= 1")
            if kind in seen_kinds:
                raise ValueError(f"Round kind '{kind}' appears more than once")
            seen_kinds.add(kind)
            normalized_rules.append(RoundTypeRule(kind=kind, every_n_songs=int(rule.every_n_songs)))

        self.round_rules = normalized_rules

    def to_dict(self) -> dict[str, Any]:
        return {
            "key": self.key,
            "name": self.name,
            "stage_durations": self.stage_durations,
            "stage_points": self.stage_points,
            "bonus_points_both": self.bonus_points_both,
            "wrong_guess_penalty": self.wrong_guess_penalty,
            "required_points_to_win": self.required_points_to_win,
            "round_rules": [
                {
                    "kind": rule.kind,
                    "every_n_songs": rule.every_n_songs,
                }
                for rule in self.round_rules
            ],
            "filters": self.filters,
        }

    @staticmethod
    def from_dict(payload: dict[str, Any]) -> "GameModePreset":
        rules_raw = payload.get("round_rules") or []
        rules = [
            RoundTypeRule(
                kind=str(item.get("kind") or "").strip(),
                every_n_songs=int(item.get("every_n_songs") or 0),
            )
            for item in rules_raw
            if isinstance(item, dict)
        ]
        preset = GameModePreset(
            key=str(payload.get("key") or "").strip(),
            name=str(payload.get("name") or "").strip(),
            stage_durations=[int(value) for value in (payload.get("stage_durations") or [])],
            stage_points=[int(value) for value in (payload.get("stage_points") or [])],
            round_rules=rules,
            bonus_points_both=int(payload.get("bonus_points_both", DEFAULT_BONUS_POINTS_BOTH)),
            wrong_guess_penalty=int(payload.get("wrong_guess_penalty", DEFAULT_WRONG_GUESS_PENALTY)),
            required_points_to_win=int(payload.get("required_points_to_win", DEFAULT_REQUIRED_POINTS_TO_WIN)),
            filters=payload.get("filters") if isinstance(payload.get("filters"), dict) else {},
        )
        preset.validate()
        return preset


class GameModeService:
    def __init__(self) -> None:
        self._preset_file = Path(__file__).resolve().parents[1] / "data" / "game_mode_presets.json"
        self._presets: dict[str, GameModePreset] = {}
        self._load_presets()

    def all_presets(self) -> list[GameModePreset]:
        return list(self._presets.values())

    def all_modes(self) -> list[dict[str, str]]:
        return [{"key": preset.key, "name": preset.name} for preset in self._presets.values()]

    def get(self, key: str) -> GameModePreset:
        preset = self._presets.get(key)
        if not preset:
            raise ValueError(f"Unknown game mode preset: {key}")
        return preset

    def resolve(self, preset_key: str | None, mode_override: GameModePreset | None = None) -> GameModePreset:
        if mode_override:
            mode_override.validate()
            return mode_override

        lookup_key = (preset_key or DEFAULT_PRESET_KEY).strip()
        return self.get(lookup_key)

    def build_custom_mode(
        self,
        name: str,
        stage_durations: list[int],
        stage_points: list[int],
        round_rules: list[RoundTypeRule],
        bonus_points_both: int,
        wrong_guess_penalty: int,
        required_points_to_win: int,
        filters: dict[str, Any] | None = None,
    ) -> GameModePreset:
        key = self._slugify(name)
        preset = GameModePreset(
            key=key,
            name=name.strip(),
            stage_durations=[int(value) for value in stage_durations],
            stage_points=[int(value) for value in stage_points],
            round_rules=round_rules,
            bonus_points_both=int(bonus_points_both),
            wrong_guess_penalty=int(wrong_guess_penalty),
            required_points_to_win=int(required_points_to_win),
            filters=filters or {},
        )
        preset.validate()
        return preset

    def round_type_requires_phone_connections(self, round_kind: str) -> bool:
        return ROUND_TYPE_PHONE_REQUIREMENTS.get(round_kind.strip().lower(), False)

    def mode_requires_phone_connections(self, preset: GameModePreset) -> bool:
        return any(self.round_type_requires_phone_connections(rule.kind) for rule in preset.round_rules)

    def save_preset(self, preset: GameModePreset) -> GameModePreset:
        preset.validate()
        self._presets[preset.key] = preset
        self._persist_presets()
        return preset

    def pick_round_kind(self, preset: GameModePreset, song_number: int) -> str:
        if song_number < 1:
            song_number = 1

        prioritized = sorted(
            preset.round_rules,
            key=lambda item: (item.every_n_songs, item.kind == "audio"),
            reverse=True,
        )
        for rule in prioritized:
            if song_number % rule.every_n_songs == 0:
                return rule.kind

        audio_rule = next((rule for rule in preset.round_rules if rule.kind == "audio"), None)
        return audio_rule.kind if audio_rule else preset.round_rules[0].kind

    def _load_presets(self) -> None:
        self._presets = {}
        defaults = self._default_presets()

        if not self._preset_file.exists():
            for preset in defaults:
                self._presets[preset.key] = preset
            self._persist_presets()
            return

        try:
            payload = json.loads(self._preset_file.read_text(encoding="utf-8"))
            entries = payload if isinstance(payload, list) else []
            for item in entries:
                if not isinstance(item, dict):
                    continue
                preset = GameModePreset.from_dict(item)
                self._presets[preset.key] = preset
        except Exception:
            self._presets = {}

        for preset in defaults:
            if preset.key not in self._presets:
                self._presets[preset.key] = preset

        self._persist_presets()

    def _persist_presets(self) -> None:
        self._preset_file.parent.mkdir(parents=True, exist_ok=True)
        data = [preset.to_dict() for preset in self._presets.values()]
        self._preset_file.write_text(json.dumps(data, indent=2), encoding="utf-8")

    def _slugify(self, text: str) -> str:
        normalized = re.sub(r"[^a-z0-9]+", "-", text.strip().lower()).strip("-")
        key = normalized or "custom-mode"
        if key not in self._presets:
            return key

        suffix = 2
        while f"{key}-{suffix}" in self._presets:
            suffix += 1
        return f"{key}-{suffix}"

    def _default_presets(self) -> list[GameModePreset]:
        return [
            GameModePreset(
                key="classic_audio",
                name="Classic Audio",
                stage_durations=[2, 5, 8],
                stage_points=[100, 60, 30],
                bonus_points_both=1,
                wrong_guess_penalty=10,
                required_points_to_win=300,
                round_rules=[RoundTypeRule(kind="audio", every_n_songs=1)],
                filters={},
            ),
            GameModePreset(
                key="mixed_media",
                name="Mixed Media",
                stage_durations=[2, 5, 8],
                stage_points=[100, 60, 30],
                bonus_points_both=1,
                wrong_guess_penalty=10,
                required_points_to_win=300,
                round_rules=[
                    RoundTypeRule(kind="audio", every_n_songs=1),
                    RoundTypeRule(kind="video", every_n_songs=5),
                    RoundTypeRule(kind="lyrics", every_n_songs=10),
                ],
                filters={"release_year_from": None, "release_year_to": None, "language": ""},
            ),
        ]
