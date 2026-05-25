import sqlite3
c=sqlite3.connect('dev.db')
print(c.execute('SELECT sql FROM sqlite_master WHERE type=\'table\' AND name=\'indexed_tracks\'').fetchone()[0])
