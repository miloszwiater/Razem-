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

## Prywatność: tryb ducha i rozłączanie

- **Tryb ducha** (Ustawienia → Prywatność, albo z mapy): przerwa na 1 h, 8 h lub do odwołania (`/api/ghost`, kolumna `members.ghost_until`). Od razu kasuje ostatnią pozycję z serwera, a nowe pomiary są odrzucane, więc partner nie widzi Cię na mapie i wykrywanie spotkań czeka. Partner widzi tylko „ma przerwę od mapy”.
- **Rozłącz parę** (Ustawienia → Prywatność): jedno potwierdzenie i `/api/unpair` w jednej transakcji usuwa wszystkie wiersze pary: spotkania, nagrody, domek, quizy, energię, pozycje, push i kody logowania. Oba telefony tracą sesję; drugi przy następnej synchronizacji wraca do ekranu startowego z komunikatem „Połączenie zostało zakończone”. Nie da się tego cofnąć.
- Migracja `migrations/0008_ghost.sql` jest przyrostowa; Worker sam dodaje kolumnę (`ensureSchema`), więc deploy nie wymaga ręcznej migracji.
- **Usuń mój awatar** i rozłączenie pary kasują też własne postacie (patrz niżej).

## Własna postać z selfie

Przy tworzeniu pary i dołączaniu (po imieniu) oraz w Ustawieniach → „Twoja postać” każda osoba może zrobić selfie albo wybrać zdjęcie. Puszystek rysuje z niego jej postać chibi w stylu aplikacji (zawsze ten sam styl: mrugnięcie, rumieńce, pastelowa kreska — jedna seria dla wszystkich). Bez postaci zostają domyślne portrety. Tryb `?demo=1` niczego nie generuje.

- **Przepływ:** telefon odwraca zdjęcie wg EXIF, lokalnie sprawdza twarz (`public/avatar.js` + `public/vendor/pico.js`, MIT, ładowane dopiero po wybraniu zdjęcia; nic nie jest przy tym wysyłane), kadruje głowę i ramiona do 496×496 JPEG. `POST /api/avatar/generate` → model widzenia opisuje cechy (fryzura, kolor włosów i brody, oczy, okulary, kolczyki, karnacja, ubranie; odrzuca zdjęcia bez twarzy i z kilkoma twarzami) → FLUX.2 [klein] rysuje 512×512 z dwoma obecnymi portretami (`public/img/avatar-style-1/2.png`) jako wzorem stylu. Domyślnie 1 rysunek, „Pokaż jeszcze jeden” dorysowuje kolejny (bez ponownego opisu). `POST /api/avatar/choose` zapisuje wybrany, `POST /api/avatar/delete` wraca do domyślnej postaci. `/api/state` podaje `members[].avatar` (URL albo `null`) — nagłówek, mapa, karta spotkania i quizy biorą go przez `AV(slot)`.
- **Dostawca w jednym miejscu:** `src/avatar.js` → `AVATAR` (modele, limity, rozmiar) i `PROVIDERS` (`describe` + `draw`). Przejście np. na fal.ai / Nano Banana = nowy wpis w `PROVIDERS` + sekret z kluczem + zmiana `AVATAR.provider`.
- **Prywatność:** selfie jest tylko w pamięci żądania (i w pamięci otwartego okna na telefonie); nie trafia do D1, R2 ani logów. W D1 są wyłącznie: wybrany rysunek (`avatars`, klucz losowy, nowy przy każdej zmianie), szkice do wyboru (`avatar_drafts`, max 5 na osobę, kasowane po wyborze / po godzinie / przy usunięciu) i liczniki dzienne. Obrazek: `GET /api/avatar-img/<klucz>` (losowy 128-bitowy klucz, bez logowania, cache na stałe). `/api/unpair` usuwa postacie, szkice i liczniki obu osób.
- **Koszty (Workers AI, darmowe 10 000 neuronów/dzień na konto, reset 00:00 UTC):** zmierzone — rysunek 512×512 ≈ 109–118 neuronów (model liczy minimum 1 MP), opis cech ≈ 23–25, nieudane wywołania 0. Pierwsza postać ≈ 145, każdy kolejny rysunek ≈ 120. Limity: 4 rysunki na osobę dziennie (`avatar_usage`) i blokada całego konta przy 9 000 neuronów (`avatar_pool`, liczone przed wywołaniem) — Worker nigdy sam nie wchodzi w płatne zużycie. Gdy pula się skończy (albo Workers AI zwróci błąd 4006), aplikacja mówi „Puszystek dziś już dużo rysował — spróbuj jutro” i zostawia domyślną postać.
- **Konfiguracja:** `wrangler.jsonc` → `"ai": {"binding": "AI", "remote": true}` (bez kluczy i sekretów). Migracja `migrations/0009_avatar.sql` jest przyrostowa; Worker i tak sam zakłada tabele i kolumnę `members.avatar_key`.
- **Testy:** `tools/avatar-checks.mjs` (API + dwie przeglądarki + zrzuty 390×844). Generator jest wtedy atrapą: w `.dev.vars` lokalnego `wrangler dev` ustaw `AVATAR_MOCK=1` i `AVATAR_TIMEOUT_MS=3000`; test przerywa pracę, jeśli atrapa nie jest włączona, więc nie wydaje neuronów.

## Domek, nagrody, quizy, energia

- Domek: pięć pokoi (salon, sypialnia, kuchnia, łazienka, taras), otwieranych wraz z liczbą spotkań. Geometria, strefy, kolizje i „stawianie na meblach” są w `public/room.js` — te same reguły sprawdza edytor i Worker (`/api/room-move`, 409 przy konflikcie). Grafiki: `tools/house.py`, `house2.py`, `house3.py`.
- Nagrody: `public/rewards.js` — 111 rzeczy (69 do domku, 42 dla Puszystka) z trzech źródeł postępu: spotkania, quizy, dni pełne energii; zestawy tematyczne i osiągnięcia.
- Quizy: `public/quiz-bank.js` (4 tryby, polski bank pytań) i `/api/quiz/*`. Serwer losuje pytania, ukrywa odpowiedź partnera do czasu obu odpowiedzi, przechodzi dalej tylko raz, liczy wynik i nagradza maks. 2 quizy dziennie. Sesja przechowuje pełne pytania, więc pytania z innego źródła (np. wygenerowane przez AI) wystarczy sprawdzić `validQuestion`.
- Energia Puszystka (0–100, wspólna): zdarzenia z idempotentnymi kluczami w `energy_events` — +12 pierwsze spotkanie dnia, +3 kolejne (do dwóch), +5 pierwszy quiz dnia, −3 dzień bez spotkania (nigdy poniżej 15, tryb odpoczynku wyłącza spadek). Dni liczone w strefie czasowej pary. Energia zmienia zachowanie Puszystka, nigdy nie zabiera nagród.
- Trzy osobne wartości: **pierwsze spotkanie** (opcjonalna data-pamiątka, można ją usunąć; wpływa tylko na napis „od X dni”), **liczba spotkań** (zapisane spotkania) i **seria** (`public/streak.js`: kolejne dni kalendarzowe w strefie czasowej pary z co najmniej jednym spotkaniem; kilka spotkań jednego dnia = jeden dzień; seria trwa jeszcze przez następny dzień i przerywa ją dopiero cały dzień bez spotkania). Najdłuższa seria jest zapisywana w `pair_prefs.streak_best` i tylko rośnie, więc nagrody za serie (3, 7, 14, 30, 60, 100 dni) zostają po jej przerwaniu.
- Data pierwszego spotkania nie tworzy spotkań i nie zmienia licznika, serii, energii ani nagród. Spotkanie dopisane wstecz liczy się do licznika i serii (to zapisane spotkanie), ale nie zmienia energii Puszystka za dni sprzed jej startu.
- Audyt nagród (tylko odczyt): `node tools/audit-rewards.mjs --remote` przelicza postęp z zapisanych spotkań, serii i quizów i wypisuje nagrody bez pokrycia. Niczego nie zmienia; ewentualna korekta to osobny, przejrzany krok — przedmioty nigdy nie są zabierane automatycznie.
- Migracje są wyłącznie przyrostowe (`migrations/0002`–`0006`); Worker dodatkowo uzupełnia brakujące kolumny i tabele (`ensureSchema`).
