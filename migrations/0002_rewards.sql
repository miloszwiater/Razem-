-- Etap 2: nagrody, wyposażenie Puszystka i promień wykrywania.
-- Przyrostowe i bezpieczne: dodaje tylko nową tabelę, nie zmienia istniejących danych.
-- Worker tworzy ją też sam przy pierwszym zapytaniu (ensureSchema w src/index.js).
CREATE TABLE IF NOT EXISTS pair_prefs (
 pair_id TEXT PRIMARY KEY REFERENCES pairs(id),
 radius INTEGER NOT NULL DEFAULT 150,
 equipped TEXT NOT NULL DEFAULT '[]',
 opened TEXT NOT NULL DEFAULT '[]',
 seen_count INTEGER NOT NULL DEFAULT 0,
 updated_at INTEGER NOT NULL DEFAULT 0
);
