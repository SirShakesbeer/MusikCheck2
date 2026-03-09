from pathlib import Path
from urllib.parse import parse_qs, urlparse

from sqlalchemy.orm import Session

from app.domain.providers.base import MediaItem
from app.domain.models import IndexedTrack, MediaSource

AUDIO_EXTENSIONS = {".mp3", ".wav", ".flac", ".m4a", ".ogg"}


class MediaLibraryService:
    def register_source(self, db: Session, provider_key: str, source_value: str) -> MediaSource:
        source = (
            db.query(MediaSource)
            .filter(MediaSource.provider_key == provider_key)
            .filter(MediaSource.source_value == source_value)
            .first()
        )
        if source:
            return source

        source = MediaSource(provider_key=provider_key, source_value=source_value)
        db.add(source)
        db.commit()
        db.refresh(source)
        return source

    def register_local_source(self, db: Session, folder_path: str) -> MediaSource:
        return self.register_source(db, "local_folder", folder_path)

    def list_sources(self, db: Session) -> list[MediaSource]:
        return db.query(MediaSource).order_by(MediaSource.created_at.desc()).all()

    def get_source(self, db: Session, source_id: str) -> MediaSource | None:
        return db.query(MediaSource).filter(MediaSource.id == source_id).first()

    def index_local_source(self, db: Session, source_id: str) -> int:
        source = db.query(MediaSource).filter(MediaSource.id == source_id).first()
        if not source:
            raise ValueError("Source not found")

        root = Path(source.source_value)
        if not root.exists() or not root.is_dir():
            raise ValueError("Local folder does not exist")

        indexed_count = 0
        for path in root.rglob("*"):
            if not path.is_file() or path.suffix.lower() not in AUDIO_EXTENSIONS:
                continue

            stat = path.stat()
            file_path = str(path)
            title, artist = self._title_artist_from_filename(path.stem)

            existing = db.query(IndexedTrack).filter(IndexedTrack.file_path == file_path).first()
            if existing:
                if existing.file_mtime == int(stat.st_mtime) and existing.file_size == int(stat.st_size):
                    continue
                existing.title = title
                existing.artist = artist
                existing.file_mtime = int(stat.st_mtime)
                existing.file_size = int(stat.st_size)
                existing.source_id = source.id
            else:
                db.add(
                    IndexedTrack(
                        source_id=source.id,
                        file_path=file_path,
                        title=title,
                        artist=artist,
                        file_mtime=int(stat.st_mtime),
                        file_size=int(stat.st_size),
                    )
                )
            indexed_count += 1

        db.commit()
        return indexed_count

    def get_source_track_count(self, db: Session, source_id: str) -> int:
        return db.query(IndexedTrack).filter(IndexedTrack.source_id == source_id).count()

    def list_indexed_tracks(
        self,
        db: Session,
        source_ids: list[str] | None = None,
        limit: int = 500,
    ) -> list[tuple[IndexedTrack, MediaSource]]:
        query = db.query(IndexedTrack, MediaSource).join(MediaSource, IndexedTrack.source_id == MediaSource.id)
        if source_ids:
            query = query.filter(IndexedTrack.source_id.in_(source_ids))

        return query.order_by(IndexedTrack.updated_at.desc()).limit(limit).all()

    def sync_remote_source(self, db: Session, source_id: str, items: list[MediaItem]) -> int:
        source = db.query(MediaSource).filter(MediaSource.id == source_id).first()
        if not source:
            raise ValueError("Source not found")

        changed_count = 0
        for item in items:
            external_track_key = item.media_path or item.source_id
            if source.provider_key == "youtube_playlist" and item.media_path:
                parsed = urlparse(item.media_path)
                values = parse_qs(parsed.query).get("v")
                if values:
                    external_track_key = values[0]

            existing = (
                db.query(IndexedTrack)
                .filter(IndexedTrack.source_id == source.id)
                .filter(IndexedTrack.file_path == external_track_key)
                .first()
            )
            if existing:
                if existing.title == item.title and existing.artist == item.artist:
                    continue
                existing.title = item.title
                existing.artist = item.artist
            else:
                db.add(
                    IndexedTrack(
                        source_id=source.id,
                        file_path=external_track_key,
                        title=item.title,
                        artist=item.artist,
                        file_mtime=0,
                        file_size=0,
                    )
                )
            changed_count += 1

        db.commit()
        return changed_count

    def _title_artist_from_filename(self, stem: str) -> tuple[str, str]:
        if " - " in stem:
            artist, title = stem.split(" - ", 1)
            return title.strip(), artist.strip()
        return stem.strip(), "Unknown Artist"
