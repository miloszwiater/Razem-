-- Etap 6: free arrangement of the shared house + when achievements were reached.
-- Additive only (new columns with defaults); the Worker adds them itself too.
ALTER TABLE pair_prefs ADD COLUMN room TEXT NOT NULL DEFAULT '{}';
ALTER TABLE pair_prefs ADD COLUMN achieved TEXT NOT NULL DEFAULT '{}';
