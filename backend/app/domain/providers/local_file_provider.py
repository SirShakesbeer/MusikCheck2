import re
from pathlib import Path

from mutagen import File as MutagenFile

from app.domain.providers.base import MediaItem, MediaProvider

AUDIO_EXTENSIONS = {".mp3", ".wav", ".flac", ".m4a", ".ogg"}


def extract_local_file_metadata(path: Path) -> tuple[str, str, int | None]:
    title, artist = _title_artist_from_filename(path.stem)
    release_year = _release_year_from_audio_file(path)
    return title, artist, release_year


def _title_artist_from_filename(stem: str) -> tuple[str, str]:
    if " - " in stem:
        artist, title = stem.split(" - ", 1)
        return title.strip(), artist.strip()
    return stem.strip(), "Unknown Artist"


def _release_year_from_audio_file(path: Path) -> int | None:
    try:
        audio_file = MutagenFile(path)
    except Exception:
        return None

    if not audio_file or not getattr(audio_file, "tags", None):
        return None

    tags = audio_file.tags
    for key in ("TDRC", "TYER", "date", "DATE", "year", "YEAR", "originaldate"):
        if key not in tags:
            continue
        year = _parse_year_value(tags.get(key))
        if year is not None:
            return year

    return None


def _parse_year_value(raw_value: object) -> int | None:
    if raw_value is None:
        return None

    match = re.search(r"(19|20)\d{2}", str(raw_value))
    if not match:
        return None
    return int(match.group(0))


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
        for path in root.rglob("*"):
            if not path.is_file() or path.suffix.lower() not in AUDIO_EXTENSIONS:
                continue

            title, artist, release_year = extract_local_file_metadata(path)
            items.append(
                MediaItem(
                    source_id=str(path),
                    title=title,
                    artist=artist,
                    media_path=str(path),
                    release_year=release_year,
                )
            )
        return items
