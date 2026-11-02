-- Fix: the best streak (days in a row with a meeting) ever reached; it only grows,
-- so streak rewards stay after a streak breaks. Additive only.
ALTER TABLE pair_prefs ADD COLUMN streak_best INTEGER NOT NULL DEFAULT 0;
