# Razem — PWA dla dwojga

Jednoekranowa aplikacja na dwa telefony: wspólny licznik spotkań, kod zaproszenia, nagrody, pikselowy Puszystek, synchronizacja przez Cloudflare D1 i opcjonalne wykrywanie bliskości podczas korzystania z aplikacji.

## Uruchomienie

```bash
npm install
npm run db:remote
npm run deploy
```

Baza D1 została już utworzona i zainicjalizowana na koncie Cloudflare. `wrangler.jsonc` zawiera jej identyfikator. Przed deployem zaloguj się do właściwego konta przez `npx wrangler login`.

## Ważne

- Lokalizacja jest opcjonalna; obie osoby muszą mieć aplikację otwartą. iOS nie zapewnia niezawodnego śledzenia geolokalizacji PWA w tle.
- Autozapis: obie osoby w promieniu 150 m, dokładność GPS do 150 m, minimum 10 minut; kolejne spotkanie po wykryciu 30 minut oddalenia. Zabezpieczenie przed powtórnym wpisem w ciągu 12 h.
- Pozycje są nadpisywane w bazie, nie są przechowywane jako trasy. Po wyłączeniu lokalizacji pozycja jest usuwana.
- Token urządzenia przechowywany lokalnie; odłączenie telefonu usuwa token z urządzenia. Odzyskiwanie konta nie jest zaimplementowane.
- Nagrody są wirtualne. Wersja 1 nie ma powiadomień push ani natywnego monitorowania lokalizacji w tle.
