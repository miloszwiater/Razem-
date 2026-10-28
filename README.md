# Razem — PWA dla dwojga

Wspólny licznik spotkań na dwa telefony: kod zaproszenia, cele i nagrody, pikselowy Puszystek, synchronizacja przez Cloudflare D1 i opcjonalne wykrywanie bliskości, gdy aplikacja jest otwarta.

Trzy ekrany odwzorowują makiety `references/01-home.png`, `02-rewards.png`, `03-detection.png`:

| Ekran | Adres |
| --- | --- |
| Główny | `/` |
| Cele i nagrody | `/#/nagrody` |
| Wykryte spotkanie / lokalizacja | `/#/spotkanie` |

`?demo=1` pokazuje dane z makiet (27 spotkań, poziom 4…), nie wymaga konta i **nigdy nie zapisuje** niczego do API.

## Uruchomienie

```bash
npm install
npm run db:local   # tylko lokalna baza do `wrangler dev`
npm run dev        # buduje style.css i uruchamia wrangler dev
npm run deploy     # buduje style.css i wdraża Worker razem-dwoje
```

Produkcyjna baza D1 `razem-dwoje-data` już istnieje i ma dane — **nie uruchamiaj `npm run db:remote`** (schemat używa `CREATE TABLE IF NOT EXISTS`, ale nie ma potrzeby go ponawiać). Przed deployem: `npx wrangler login` na koncie właściciela Workera.

## Frontend

- `styles/app.css` — źródło stylów. Jednostka `dp` to 1/390 szerokości kolumny; `build-css.mjs` zamienia `12dp` na `calc(12 * var(--u))`, dzięki czemu kompozycja skaluje się proporcjonalnie na szerokościach 320–440 px, a na desktopie jest wyśrodkowaną kolumną. Nie edytuj `public/style.css` ręcznie.
- `public/app.js` — widoki, routing (hash), animacje, arkusze, logika API (bez zmian kontraktu z backendem).
- `public/img/` — zasoby wycięte z makiet: plansze tła z usuniętym UI (inpainting), sprite'y Puszystka (+ klatki mrugnięcia), pikselowe serca i iskierki, logotyp. Generowane skryptami `tools/extract.py` i `tools/blink.py` z katalogu przekazania.
- `public/fonts/` — statyczne instancje DM Sans (OFL) 400–800, latin + latin-ext.
- `prefers-reduced-motion` wyłącza animacje ozdobne.

## Ważne

- Lokalizacja jest opcjonalna; obie osoby muszą mieć aplikację otwartą. iOS nie zapewnia niezawodnej geolokalizacji PWA w tle.
- Autozapis: obie osoby w promieniu 150 m, dokładność do 150 m, minimum 10 minut; kolejne spotkanie po 30 minutach oddalenia; blokada powtórnego wpisu w ciągu 12 h.
- Pozycje są nadpisywane, bez historii tras. Po wyłączeniu lokalizacji pozycja jest usuwana.
- Powiadomienia i przełącznik synchronizacji działają lokalnie (Notification API, gdy aplikacja jest otwarta; włączanie/wyłączanie odpytywania). Brak push w tle.
