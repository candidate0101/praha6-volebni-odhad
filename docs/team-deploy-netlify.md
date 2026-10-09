# Týmový provoz na Netlify

Cíl: všichni přihlášení vidí stejné ruční zápisy a obnovení okna ani výpadek spojení nic nesmaže.

## Jak to funguje

- **Přihlášení:** jedno týmové heslo (`TEAM_PASSWORD`) ověřuje server. Po přihlášení dostane prohlížeč na 24 h HttpOnly cookie podepsanou `SESSION_SECRET`. Každý zadá své jméno a to se ukládá ke všem jeho zápisům. Bez přihlášení nejde nic číst ani zapisovat, a to ani oficiální výsledky.
- **Ruční zápisy** (`/`, `/predpokladane-slozeni`) jsou v databázi `MANUAL_ENTRIES_DATABASE_URL` (schéma `db/manual-entries.sql`). Každé uložení, oprava i smazání je nová revize s autorem a časem. Nic se nepřepisuje a databáze UPDATE i DELETE odmítne. Stránka se obnovuje každých 5 s.
- **Souběžné úpravy:** zápis nese revizi, kterou člověk viděl. Když okrsek mezitím změnil někdo jiný, server zápis odmítne. U formuláře se pak objeví „Konflikt · okrsek X mezitím změnil(a) Y“ i s neuloženými hodnotami. Totéž databáze vynutí i při dvou úplně současných zápisech (`unique (precinct_number, based_on_revision)`).
- **Výpadek spojení:** zápis se nejdřív uloží do fronty v prohlížeči (`localStorage`) a ukáže se jako „neodesláno“. Odešle se sám, jakmile server odpoví. Jednoznačné `clientId` zaručí, že se opakované odeslání neuloží dvakrát. Během výpadku stránka ukazuje poslední známý stav ze serveru.
- **Starší zápisy z prohlížeče** (z doby před sdíleným úložištěm) nabídne stránka nahrát tlačítkem. Nahraje jen okrsky, které server ještě nemá. Lokální originál zůstane uložený pod klíčem `…entries.v1.uploaded-<čas>`.
- **Oficiální výsledky** mají vlastní databázi `OFFICIAL_RESULTS_DATABASE_URL`. Importér ČSÚ na Netlify spouští plánovaná funkce `netlify/functions/import-official.mts` každou minutu.

## Nastavení (jednou, před volební nocí)

1. **Neon** (<https://neon.com>): založte projekt a v něm **dvě databáze**, např. `manual` a `official`. Zkopírujte si dva connection stringy (s `sslmode=require`).
2. **Lokálně** vytvořte tabulky: do `.env.local` zapište obě URL a spusťte:
   ```
   npm run db:manual:apply
   npm run db:official:apply
   ```
   Skript odmítne pokračovat, pokud obě proměnné ukazují na stejnou databázi.
3. **Netlify:** Add new site → Import from Git → repozitář `praha6-volebni-odhad`. Build se nastaví z `netlify.toml`. V Site configuration → Environment variables nastavte:
   - `TEAM_PASSWORD`: týmové heslo, alespoň 10 znaků;
   - `SESSION_SECRET`: náhodný řetězec, alespoň 32 znaků (`openssl rand -hex 32`);
   - `MANUAL_ENTRIES_DATABASE_URL`;
   - `OFFICIAL_RESULTS_DATABASE_URL`.

   Pak spusťte Deploy.
4. **Ověření po nasazení:**
   - přihlášení špatným heslem selže;
   - zápis okrsku ze dvou různých zařízení se objeví na obou;
   - v Netlify → Functions → `import-official` běží každou minutu a v logu hlásí `not_yet_available`, dokud ČSÚ nevydá první dávku;
   - `/official-results` ukazuje „ČSÚ zatím nevydal žádnou okrskovou dávku“.

Bez proměnných běží aplikace jako dřív: zápisy zůstávají jen v daném prohlížeči a stránka to řekne. Když je databáze nastavená, ale chybí heslo, server odmítne běžet otevřeně a zobrazí chybu nastavení.

## Lokální vyzkoušení týmového režimu bez Neonu

```
TEAM_PASSWORD=nejake-heslo-123 SESSION_SECRET=$(openssl rand -hex 32) \
MANUAL_ENTRIES_DATABASE_URL=pglite:./.data/manual \
OFFICIAL_RESULTS_DATABASE_URL=pglite:./.data/official \
npm run build && npx next start -p 3027
```

`pglite:` spustí skutečný Postgres (PGlite) uložený v `.data/`, který je v gitignore. Schéma se aplikuje samo. Je to jen pro vyzkoušení na jednom počítači, ne pro provoz.

## Co je ověřené a co ne

- **Ověřeno** (2026-10-09):
  - testy nad PGlite: schéma, konflikty včetně současných zápisů, idempotence, append-only, API, přihlášení, CSRF;
  - produkční build `next start` s PGlite. V prohlížeči a druhým klientem jsem prošla přihlášení, sdílení zápisu, obnovení okna po vymazání `localStorage`, konflikt, výpadek serveru se zápisem a automatické odeslání po návratu bez zmizení dat, nahrání starších zápisů a mobil.
- **Neověřeno:** skutečný Neon a skutečné nasazení na Netlify včetně plánované funkce. Zatím neexistuje databáze ani nasazený web. Po prvním nasazení projděte bod 4 výše.
