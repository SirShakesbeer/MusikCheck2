import sqlite3
c=sqlite3.connect('dev.db')
c.execute('DELETE FROM indexed_tracks WHERE source_id IN (SELECT id FROM media_sources WHERE provider_key=\'youtube_playlist\')')
c.commit()
