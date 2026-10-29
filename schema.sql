CREATE TABLE IF NOT EXISTS pairs (
 id TEXT PRIMARY KEY,
 invite_code TEXT NOT NULL UNIQUE,
 created_at INTEGER NOT NULL,
 first_met_at TEXT,
 active_since INTEGER,
 active_recorded INTEGER NOT NULL DEFAULT 0,
 apart_since INTEGER,
 confirm1_at INTEGER,
 confirm2_at INTEGER,
 notified_near_at INTEGER
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
 geo_on INTEGER NOT NULL DEFAULT 0,
 ping_at INTEGER,
 UNIQUE(pair_id, slot)
);
CREATE TABLE IF NOT EXISTS meetings (
 id TEXT PRIMARY KEY,
 pair_id TEXT NOT NULL REFERENCES pairs(id),
 occurred_at INTEGER NOT NULL,
 source TEXT NOT NULL CHECK(source IN ('manual','auto')),
 created_by TEXT,
 created_at INTEGER NOT NULL,
 session_key TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_meetings_session ON meetings(session_key) WHERE session_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_meetings_pair ON meetings(pair_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS ix_members_pair ON members(pair_id);

CREATE TABLE IF NOT EXISTS pair_prefs (
 pair_id TEXT PRIMARY KEY REFERENCES pairs(id),
 radius INTEGER NOT NULL DEFAULT 150,
 equipped TEXT NOT NULL DEFAULT '[]',
 opened TEXT NOT NULL DEFAULT '[]',
 seen_count INTEGER NOT NULL DEFAULT 0,
 updated_at INTEGER NOT NULL DEFAULT 0,
 claimed TEXT NOT NULL DEFAULT '[]',
 version INTEGER NOT NULL DEFAULT 0,
 last_change TEXT,
 room TEXT NOT NULL DEFAULT '{}',
 achieved TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS member_tokens (token_hash TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members(id), created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS member_recovery (member_id TEXT PRIMARY KEY REFERENCES members(id), code_hash TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS push_subs (endpoint TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members(id), p256dh TEXT NOT NULL, auth TEXT NOT NULL, created_at INTEGER NOT NULL);

-- stage 7: couple quizzes and Puszystek energy (columns are added by migrations/0006 and ensureSchema)
CREATE TABLE IF NOT EXISTS quiz_sessions (id TEXT PRIMARY KEY, pair_id TEXT NOT NULL REFERENCES pairs(id), mode TEXT NOT NULL, questions TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'lobby', created_by INTEGER NOT NULL, created_at INTEGER NOT NULL, ready1 INTEGER NOT NULL DEFAULT 0, ready2 INTEGER NOT NULL DEFAULT 0, idx INTEGER NOT NULL DEFAULT 0, started_at INTEGER, finished_at INTEGER, day TEXT, hits INTEGER, rewarded INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS ix_quiz_pair ON quiz_sessions(pair_id, created_at);
CREATE TABLE IF NOT EXISTS quiz_answers (session_id TEXT NOT NULL REFERENCES quiz_sessions(id), idx INTEGER NOT NULL, slot INTEGER NOT NULL, answer TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (session_id, idx, slot));
CREATE TABLE IF NOT EXISTS energy_events (pair_id TEXT NOT NULL REFERENCES pairs(id), key TEXT NOT NULL, delta INTEGER NOT NULL, kind TEXT NOT NULL, day TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (pair_id, key));
