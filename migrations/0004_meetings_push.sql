-- Etap 5: reliable meeting detection, names, push notifications.
-- Additive only. The Worker applies the same changes itself when missing.
ALTER TABLE members ADD COLUMN geo_on INTEGER NOT NULL DEFAULT 0;
ALTER TABLE members ADD COLUMN ping_at INTEGER;
ALTER TABLE pairs ADD COLUMN confirm1_at INTEGER;
ALTER TABLE pairs ADD COLUMN confirm2_at INTEGER;
ALTER TABLE pairs ADD COLUMN notified_near_at INTEGER;
ALTER TABLE meetings ADD COLUMN session_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS ux_meetings_session ON meetings(session_key) WHERE session_key IS NOT NULL;
CREATE TABLE IF NOT EXISTS push_subs (endpoint TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members(id), p256dh TEXT NOT NULL, auth TEXT NOT NULL, created_at INTEGER NOT NULL);
