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

- Lokalizacja jest opcjonalna i działa tylko, gdy aplikacja jest otwarta na obu telefonach (iOS nie daje aplikacjom webowym lokalizacji w tle).
- Spotkanie: obie pozycje świeże (do 2 min), razem w promieniu wybranym w ustawieniach (50/100/150 m), przez co najmniej 60 s; przy słabym GPS potwierdzacie oboje. Kolejne spotkanie najwcześniej po 6 h. Współrzędne są usuwane z serwera po 15 min.
- Push (Web Push, VAPID) działa po dodaniu sekretu `VAPID_PRIVATE_JWK` w Workerze; bez niego aplikacja działa normalnie, tylko bez powiadomień.
- Przełącznik „Synchronizacja na tym telefonie” dotyczy tylko jednego telefonu (odświeżanie co kilka sekund).

## Mapa (`/#/spotkanie`)

- MapLibre GL JS 4.7.1 (ładowany dopiero na tym ekranie) i wektorowe kafelki OpenFreeMap (dane OpenStreetMap, schemat OpenMapTiles). Własny styl „Razem Pixel Map” to `public/map-style.json` (generuje go `tools/mapstyle.py`, razem z pikselowymi ikonami). Mapa jest rysowana 1:1 i skalowana bez wygładzania, więc ulice i parki wyglądają jak pixel art.
- Wymagana atrybucja (© OpenFreeMap, © OpenMapTiles, OpenStreetMap) jest pod przyciskiem (i) na mapie. OpenFreeMap nie wymaga klucza; zasady: rozsądny ruch, własny styl hostowany u nas.
- Partnera widać tylko po jego zgodzie („Pokazuj mnie na mapie”, `members.map_on`), osobnej od wykrywania spotkań. Pozycja starsza niż 2 min jest oznaczona jako nieaktualna, po 15 min znika.
- Ograniczenia iOS: brak lokalizacji w tle w PWA, Safari może wstrzymać stronę po zablokowaniu ekranu, a dokładność zależy od GPS/Wi-Fi. Przyszła wersja natywna (np. Capacitor + Core Location z „Significant-Change Location Service” i regionami geofence) mogłaby wykrywać spotkania w tle — wymaga konta Apple Developer i zgody „Zawsze” na lokalizację. Nie jest częścią tej wersji.

## Domek, nagrody, quizy, energia

- Domek: pięć pokoi (salon, sypialnia, kuchnia, łazienka, taras), otwieranych wraz z liczbą spotkań. Geometria, strefy, kolizje i „stawianie na meblach” są w `public/room.js` — te same reguły sprawdza edytor i Worker (`/api/room-move`, 409 przy konflikcie). Grafiki: `tools/house.py`, `house2.py`, `house3.py`.
- Nagrody: `public/rewards.js` — 111 rzeczy (69 do domku, 42 dla Puszystka) z trzech źródeł postępu: spotkania, quizy, dni pełne energii; zestawy tematyczne i osiągnięcia.
- Quizy: `public/quiz-bank.js` (4 tryby, polski bank pytań) i `/api/quiz/*`. Serwer losuje pytania, ukrywa odpowiedź partnera do czasu obu odpowiedzi, przechodzi dalej tylko raz, liczy wynik i nagradza maks. 2 quizy dziennie. Sesja przechowuje pełne pytania, więc pytania z innego źródła (np. wygenerowane przez AI) wystarczy sprawdzić `validQuestion`.
- Energia Puszystka (0–100, wspólna): zdarzenia z idempotentnymi kluczami w `energy_events` — +12 pierwsze spotkanie dnia, +3 kolejne (do dwóch), +5 pierwszy quiz dnia, −3 dzień bez spotkania (nigdy poniżej 15, tryb odpoczynku wyłącza spadek). Dni liczone w strefie czasowej pary. Energia zmienia zachowanie Puszystka, nigdy nie zabiera nagród.
- Migracje są wyłącznie przyrostowe (`migrations/0002`–`0006`); Worker dodatkowo uzupełnia brakujące kolumny i tabele (`ensureSchema`).
