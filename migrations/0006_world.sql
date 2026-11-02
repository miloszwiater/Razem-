-- Etap 7: map consent, quizzes, Puszystek's energy. Additive only: new
-- columns and new tables; nothing existing is changed or removed.
ALTER TABLE members ADD COLUMN map_on INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pairs ADD COLUMN tz TEXT;
ALTER TABLE pair_prefs ADD COLUMN energy_rest INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pair_prefs ADD COLUMN energy_since TEXT;
CREATE TABLE IF NOT EXISTS quiz_sessions (id TEXT PRIMARY KEY, pair_id TEXT NOT NULL REFERENCES pairs(id), mode TEXT NOT NULL, questions TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'lobby', created_by INTEGER NOT NULL, created_at INTEGER NOT NULL, ready1 INTEGER NOT NULL DEFAULT 0, ready2 INTEGER NOT NULL DEFAULT 0, idx INTEGER NOT NULL DEFAULT 0, started_at INTEGER, finished_at INTEGER, day TEXT, hits INTEGER, rewarded INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS ix_quiz_pair ON quiz_sessions(pair_id, created_at);
CREATE TABLE IF NOT EXISTS quiz_answers (session_id TEXT NOT NULL REFERENCES quiz_sessions(id), idx INTEGER NOT NULL, slot INTEGER NOT NULL, answer TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (session_id, idx, slot));
CREATE TABLE IF NOT EXISTS energy_events (pair_id TEXT NOT NULL REFERENCES pairs(id), key TEXT NOT NULL, delta INTEGER NOT NULL, kind TEXT NOT NULL, day TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (pair_id, key));
