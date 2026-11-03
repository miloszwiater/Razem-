-- Tryb ducha: przerwa w udostępnianiu pozycji (mapa i wykrywanie spotkań) do
-- podanego czasu (ms). Additive only; the Worker adds the column itself too.
ALTER TABLE members ADD COLUMN ghost_until INTEGER;
