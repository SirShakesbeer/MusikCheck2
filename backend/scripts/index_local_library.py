import argparse

from app.core.database import SessionLocal
from app.services.media_library_service import MediaLibraryService


def main() -> None:
    parser = argparse.ArgumentParser(description="Index local music library into database")
    parser.add_argument("folder", help="Absolute path to local music folder")
    args = parser.parse_args()

    service = MediaLibraryService()
    with SessionLocal() as db:
        source = service.register_local_source(db, args.folder)
        changed = service.index_local_source(db, source.id)
        total = service.get_source_track_count(db, source.id)

    print(f"Source: {source.source_value}")
    print(f"Indexed/updated files this run: {changed}")
    print(f"Total indexed tracks for source: {total}")


if __name__ == "__main__":
    main()
