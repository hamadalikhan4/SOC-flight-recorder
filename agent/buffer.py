"""Durable SQLite outbox + rolling buffer + locally pinned detection windows."""
import json
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

class BufferFull(RuntimeError):
    pass

class Buffer:
    def __init__(self, path, pre_seconds=600, post_seconds=300, max_events=100000, max_bytes=67108864):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path)
        self.db.row_factory = sqlite3.Row
        self.pre = pre_seconds
        self.post = post_seconds
        self.max_events = max_events
        self.max_bytes = max_bytes
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.executescript('''
        CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,timestamp TEXT NOT NULL,payload TEXT NOT NULL,acked INTEGER NOT NULL DEFAULT 0);
        CREATE INDEX IF NOT EXISTS buffer_time ON events(timestamp);
        CREATE TABLE IF NOT EXISTS windows(id TEXT PRIMARY KEY,start TEXT NOT NULL,end TEXT NOT NULL);
        ''')

    def get(self, key, default=None):
        row = self.db.execute('SELECT value FROM metadata WHERE key=?', (key,)).fetchone()
        return row['value'] if row else default

    def put(self, key, value):
        self.db.execute('INSERT OR REPLACE INTO metadata VALUES(?,?)', (key, str(value)))

    def append(self, events, checkpoint=None, metadata=None):
        with self.db:
            count, size = self.db.execute('SELECT count(*),coalesce(sum(length(CAST(payload AS BLOB))),0) FROM events').fetchone()
            for event in events:
                exists = self.db.execute('SELECT 1 FROM events WHERE id=?', (event['event_id'],)).fetchone()
                if exists:
                    continue
                payload = json.dumps(event, sort_keys=True)
                added_bytes = len(payload.encode('utf-8'))
                if count >= self.max_events or size + added_bytes > self.max_bytes:
                    raise BufferFull('Buffer cap reached: collection paused without advancing its checkpoint')
                self.db.execute('INSERT INTO events(id,timestamp,payload) VALUES(?,?,?)',
                                (event['event_id'], event['timestamp'], payload))
                count += 1
                size += added_bytes
                parent = event.get('parent_image', '').replace('\\', '/').rsplit('/', 1)[-1].lower()
                image = event.get('image', '').replace('\\', '/').rsplit('/', 1)[-1].lower()
                if event['category'] == 'process' and event.get('process_guid') and parent in {'winword.exe','excel.exe','powerpnt.exe','outlook.exe'} and image in {'powershell.exe','pwsh.exe'}:
                    t = datetime.fromisoformat(event['timestamp'])
                    self.db.execute('INSERT OR IGNORE INTO windows VALUES(?,?,?)',
                                    (event['event_id'], (t-timedelta(seconds=self.pre)).isoformat(timespec='microseconds'),
                                     (t+timedelta(seconds=self.post)).isoformat(timespec='microseconds')))
            if checkpoint is not None:
                self.put('record_id', checkpoint)
            for key, value in (metadata or {}).items():
                self.put(key, value)

    def pending(self, limit=200):
        return [json.loads(row['payload']) for row in self.db.execute('SELECT payload FROM events WHERE acked=0 ORDER BY timestamp,id LIMIT ?', (limit,))]

    def acknowledge(self, ids):
        with self.db:
            self.db.executemany('UPDATE events SET acked=1 WHERE id=?', [(x,) for x in ids])

    def prune(self, reference=None):
        cutoff = ((reference or datetime.now(timezone.utc))-timedelta(seconds=self.pre)).isoformat(timespec='microseconds')
        # Never discard unsent records or records pinned by a detection window.
        with self.db:
            return self.db.execute('DELETE FROM events WHERE acked=1 AND timestamp<? AND NOT EXISTS (SELECT 1 FROM windows WHERE events.timestamp>=windows.start AND events.timestamp<=windows.end)', (cutoff,)).rowcount

    def counts(self):
        return {'buffer_events': self.db.execute('SELECT count(*) FROM events').fetchone()[0],
                'queued_events': self.db.execute('SELECT count(*) FROM events WHERE acked=0').fetchone()[0]}

    def close(self):
        self.db.close()
