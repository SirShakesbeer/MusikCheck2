from pathlib import Path

from app.domain.providers.base import MediaItem, MediaProvider


class TextListProvider(MediaProvider):
    key = "text_list"

    def fetch_items(self, source: str) -> list[MediaItem]:
        text = Path(source).read_text(encoding="utf-8")
        items: list[MediaItem] = []
        for idx, line in enumerate(text.splitlines(), start=1):
            if not line.strip():
                continue
            title, artist = [part.strip() for part in (line.split("-", 1) + ["Unknown Artist"])[:2]]
            items.append(MediaItem(source_id=f"txt-{idx}", title=title, artist=artist))
        return items
