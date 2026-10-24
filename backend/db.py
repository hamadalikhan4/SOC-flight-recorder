import sqlite3
from contextlib import contextmanager
from pathlib import Path

SCHEMA = '''
CREATE TABLE IF NOT EXISTS endpoints (
 id TEXT PRIMARY KEY, hostname TEXT NOT NULL, platform TEXT NOT NULL,
 token_hash TEXT NOT NULL UNIQUE, revoked INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL, last_seen TEXT, heartbeat TEXT);
CREATE TABLE IF NOT EXISTS events (
 endpoint_id TEXT NOT NULL REFERENCES endpoints(id), event_id TEXT NOT NULL,
 timestamp TEXT NOT NULL, category TEXT NOT NULL, process_guid TEXT, parent_guid TEXT,
 payload TEXT NOT NULL, received_at TEXT NOT NULL,
 PRIMARY KEY(endpoint_id,event_id));
CREATE INDEX IF NOT EXISTS events_time ON events(endpoint_id,timestamp,event_id);
CREATE INDEX IF NOT EXISTS events_process ON events(endpoint_id,process_guid);
CREATE TABLE IF NOT EXISTS incidents (
 id TEXT PRIMARY KEY, endpoint_id TEXT NOT NULL REFERENCES endpoints(id),
 trigger_event_id TEXT NOT NULL, rule_id TEXT NOT NULL, process_guid TEXT,
 title TEXT NOT NULL, severity TEXT NOT NULL, technique TEXT NOT NULL,
 triggered_at TEXT NOT NULL, window_start TEXT NOT NULL, window_end TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'open', created_at TEXT NOT NULL,
 UNIQUE(endpoint_id,trigger_event_id,rule_id));
CREATE TABLE IF NOT EXISTS audit (
 id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp TEXT NOT NULL, actor TEXT NOT NULL,
 action TEXT NOT NULL, resource TEXT NOT NULL, detail TEXT NOT NULL);
PRAGMA user_version=1;
'''

class Database:
    def __init__(self, path):
        self.path = str(path)
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            version = db.execute('PRAGMA user_version').fetchone()[0]
            if version not in (0, 1):
                raise RuntimeError('Unsupported database version')
            db.execute('PRAGMA journal_mode=WAL')
            db.executescript(SCHEMA)

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=15)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA foreign_keys=ON')
        try:
            with db:
                yield db
        finally:
            db.close()
