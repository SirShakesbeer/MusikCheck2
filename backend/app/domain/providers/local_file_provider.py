from pathlib import Path

from app.domain.providers.base import MediaItem, MediaProvider


class LocalFileProvider(MediaProvider):
    key = "local_files"

    def fetch_items(self, source: str) -> list[MediaItem]:
        root = Path(source)
        items: list[MediaItem] = []
        for path in root.glob("*.mp3"):
            title = path.stem
            items.append(MediaItem(source_id=str(path), title=title, artist="Unknown Artist", media_path=str(path)))
        return items
