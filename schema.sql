CREATE TABLE IF NOT EXISTS pairs (
 id TEXT PRIMARY KEY,
 invite_code TEXT NOT NULL UNIQUE,
 created_at INTEGER NOT NULL,
 first_met_at TEXT,
 active_since INTEGER,
 active_recorded INTEGER NOT NULL DEFAULT 0,
 apart_since INTEGER
);
CREATE TABLE IF NOT EXISTS members (
 id TEXT PRIMARY KEY,
 pair_id TEXT NOT NULL REFERENCES pairs(id),
 display_name TEXT NOT NULL,
 token_hash TEXT NOT NULL UNIQUE,
 slot INTEGER NOT NULL CHECK(slot IN (1,2)),
 joined_at INTEGER NOT NULL,
 latitude REAL,
 longitude REAL,
 accuracy REAL,
 location_at INTEGER,
 UNIQUE(pair_id, slot)
);
CREATE TABLE IF NOT EXISTS meetings (
 id TEXT PRIMARY KEY,
 pair_id TEXT NOT NULL REFERENCES pairs(id),
 occurred_at INTEGER NOT NULL,
 source TEXT NOT NULL CHECK(source IN ('manual','auto')),
 created_by TEXT,
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_meetings_pair ON meetings(pair_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS ix_members_pair ON members(pair_id);

CREATE TABLE IF NOT EXISTS pair_prefs (
 pair_id TEXT PRIMARY KEY REFERENCES pairs(id),
 radius INTEGER NOT NULL DEFAULT 150,
 equipped TEXT NOT NULL DEFAULT '[]',
 opened TEXT NOT NULL DEFAULT '[]',
 seen_count INTEGER NOT NULL DEFAULT 0,
 updated_at INTEGER NOT NULL DEFAULT 0
);
