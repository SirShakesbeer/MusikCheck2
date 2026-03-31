from pathlib import Path

from app.domain.providers.base import MediaItem, MediaProvider


class LocalFileProvider(MediaProvider):
    key = "local_files"

    def validate_source(self, source: str) -> bool:
        source_path = Path((source or "").strip())
        return source_path.exists() and source_path.is_dir()

    def source_label(self, source: str) -> str | None:
        source_path = Path((source or "").strip())
        name = source_path.name.strip()
        return name or None

    def fetch_items(self, source: str) -> list[MediaItem]:
        root = Path(source)
        items: list[MediaItem] = []
        for path in root.glob("*.mp3"):
            title = path.stem
            items.append(MediaItem(source_id=str(path), title=title, artist="Unknown Artist", media_path=str(path)))
        return items
