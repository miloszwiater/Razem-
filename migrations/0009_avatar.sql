-- Personal avatars. Additive only; the Worker creates the same tables and the
-- column itself too (ensureSchema). The selfie is never stored: only the
-- chosen picture (avatars), short-lived drafts and daily counters.
ALTER TABLE members ADD COLUMN avatar_key TEXT;
CREATE TABLE IF NOT EXISTS avatars (key TEXT PRIMARY KEY, member_id TEXT NOT NULL, img TEXT NOT NULL, mime TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ix_avatars_member ON avatars(member_id);
CREATE TABLE IF NOT EXISTS avatar_drafts (id TEXT PRIMARY KEY, member_id TEXT NOT NULL, img TEXT NOT NULL, mime TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ix_avatar_drafts_member ON avatar_drafts(member_id);
CREATE TABLE IF NOT EXISTS avatar_usage (day TEXT NOT NULL, member_id TEXT NOT NULL, images INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, member_id));
CREATE TABLE IF NOT EXISTS avatar_pool (day TEXT PRIMARY KEY, neurons REAL NOT NULL DEFAULT 0, images INTEGER NOT NULL DEFAULT 0);
