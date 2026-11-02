-- Etap 3: one shared inventory per pair + signing in again with a login code.
-- Additive only: new columns with defaults and new tables. Existing rows keep
-- their data; outfits worn before this migration count as claimed (src/index.js).
-- The Worker applies the same changes on its own when a column is missing.
ALTER TABLE pair_prefs ADD COLUMN claimed TEXT NOT NULL DEFAULT '[]';
ALTER TABLE pair_prefs ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pair_prefs ADD COLUMN last_change TEXT;
CREATE TABLE IF NOT EXISTS member_tokens (token_hash TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members(id), created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS member_recovery (member_id TEXT PRIMARY KEY REFERENCES members(id), code_hash TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL);
