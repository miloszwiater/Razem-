-- Etap 7: map consent, quizzes, energy. Additive only.
ALTER TABLE members ADD COLUMN map_on INTEGER NOT NULL DEFAULT 0;
