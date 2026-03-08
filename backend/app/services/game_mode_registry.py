from collections.abc import Iterable

from app.domain.game_modes.base import GameModePlugin


class GameModeRegistry:
    def __init__(self, plugins: Iterable[GameModePlugin]):
        self._plugins = {plugin.key: plugin for plugin in plugins}

    def get(self, mode_key: str) -> GameModePlugin:
        plugin = self._plugins.get(mode_key)
        if not plugin:
            raise ValueError(f"Unknown game mode: {mode_key}")
        return plugin

    def all_modes(self) -> list[dict[str, str]]:
        return [{"key": plugin.key, "name": plugin.display_name} for plugin in self._plugins.values()]
