# Oficiální výsledky ČSÚ / volby.gov.cz

## Oddělení od ručního sběru

- Ruční zápisy a prognóza zůstávají na `/` (localStorage prohlížeče) a nikdy se nezapisují do tabulek `official_*`.
- Oficiální importy se zobrazují jen na `/official-results`. Stránka čte výhradně `/api/official-results`, tedy oficiální databázi.
- Na `/official-results` běží **samostatná instance** odhadu, a to jen nad oficiálními okrsky bez rozporu. Ruční zápisy do ní nevstupují a oficiální data nevstupují do modelu na `/`. Sdílí se jen statický číselník listin (`lib/demo-data.ts`, ověřeno proti registru ČSÚ) a kód výpočtu.
- Oficiální databáze má vlastní proměnnou `OFFICIAL_RESULTS_DATABASE_URL`.

## Zdroj

Specifikace: <https://volby.gov.cz/opendata/kv2026/KV2026_XML.htm> (verze 1.1 z 6. 10. 2026), XSD `kv_vysledky_okrsky.xsd`.

- URL dávky: `https://volby.gov.cz/appdata/kv2026/20261009/odata/okrsky/vysledky_okrsky_NNNNN.xml`. Dávky se číslují od 1 a vznikají zhruba každých 5 minut. Jsou **přírůstkové**: obsahují jen nově zpracované okrsky celé ČR.
- Dávka, která ještě neexistuje, vrací HTTP 404 nebo `<CHYBA KOD_CHYBY="10"/>`. Tuto odpověď živý endpoint vracel 9. 10. 2026 a je uložená v `lib/__fixtures__/csu-okrsky-live-chyba-10.xml`.
- Okrsek může přijít znovu, i s jinými čísly. Platí revize s nejvyšším `PORADI_ZPRAC`.
- Praha 6 je podle registru KV2026reg20261007: `KODZASTUP` 500178, `OZNAC_TYPU` MCMO, okrsky 6001–6104, 45 mandátů a 11 listin. Čísla listin 1–11 odpovídají `l1`–`l11`. Řádky typu OBEC (zastupitelstvo hl. m. Prahy) se ignorují.
- Finální open data (XML/CSV/JSON) zveřejní ČSÚ až po ukončení zpracování. Tento importér je nepoužívá.

## Databáze

Schéma je v `db/official-results.sql`. Všechny tabulky jsou append-only: triggery odmítají UPDATE, DELETE i TRUNCATE.

| tabulka | obsah |
| --- | --- |
| `official_fetch_attempts` | každý dotaz na ČSÚ: URL, číslo dávky, HTTP status, výsledek (`stored` / `duplicate` / `not_yet_available` / `error`) |
| `official_import_runs` | uložená dávka: URL, číslo dávky, čas generování ČSÚ, čas stažení, **surové bajty** (`bytea`), SHA-256 (CHECK ověřuje shodu s bajty), verze parseru, stav `accepted` / `rejected` s důvodem |
| `official_precinct_revisions` | jedna revize okrsku: `PORADI_ZPRAC`, `OPAKOVANE`, účast, platné hlasy, kontrola konzistence (`valid` / `discrepancy`) |
| `official_list_votes` | hlasy listin 1–11 dané revize |

- **Deduplikace:** `unique (source_sha256, parser_version)`. Stejné bajty se uloží jednou pro každou verzi parseru. Opakovaný pokus se zapíše jen do `official_fetch_attempts`.
- **Aktuální stav:** pohled `official_current_precincts` bere pro každý okrsek revizi s nejvyšším `PORADI_ZPRAC`, a to jen z dávek `accepted`. Nerozhoduje čas vložení, takže opakované přehrání staré dávky novější výsledek nepřepíše.
- **Odmítnutá dávka** (špatný formát, nesedí číslo dávky, neznámá listina, okrsek mimo rozsah): uloží se surová data a důvod, ale žádné revize. Stránka ji ukáže ve frontě k ověření.
- **Okrsek s rozporem** (součet hlasů listin ≠ `PLATNE_HLASY` nebo `PLATNE_LISTKY` > `ODEVZDANE_OBALKY`): uloží se, ve frontě se zobrazí jako rozpor a nezapočítá se do součtů ani do odhadu, dokud ČSÚ nepošle konzistentní revizi.
- Aplikační roli doporučujeme dát jen `SELECT` a `INSERT`.

## Provoz

1. Založte samostatnou databázi Neon a do `.env.local` zapište `OFFICIAL_RESULTS_DATABASE_URL=…`.
2. Spusťte `npm run db:official:apply`.
3. Na Netlify běží importér sám jako plánovaná funkce `netlify/functions/import-official.mts`, každou minutu nejvýše 3 dávky. Lokálně ho spustíte příkazem `npm run import:official`. Ptá se každých 60 s (webcache ČSÚ má 60 s) a po výpadku dožene všechny chybějící dávky. Varianty:
   - `-- --once` jednorázově stáhne, co je k dispozici;
   - `-- --batch N` stáhne dávku N znovu (uloží se jen tehdy, když se liší bajty nebo verze parseru).
4. Server Next (`npm run dev` nebo `npm start`) musí mít stejnou proměnnou. `/official-results` se obnovuje každých 60 s.

Stavy na stránce:
- „Importér ani databáze nejsou zapojené“: chybí proměnná.
- „Bez živého napojení“: neběží server, např. statický náhled na GitHub Pages, kde se `app/api` před buildem odstraňuje.
- „Importér možná neběží“: poslední dotaz je starší než 3 minuty.
- „ČSÚ zatím nevydal žádnou okrskovou dávku“: KOD_CHYBY 10 nebo 404.

## Co je ověřené a co ne

- **Ověřeno testy** (`npm test`):
  - parser nad skutečnou odpovědí ČSÚ `KOD_CHYBY 10` a nad syntetickou ukázkou formátu, která prošla validací proti oficiálnímu XSD (`xmllint --schema`);
  - schéma, triggery, kontrola hashe, deduplikace, pohled aktuálních revizí a celý tok importéru v PGlite (Postgres ve WASM).
- **Neověřeno:**
  - skutečná okrsková dávka ČSÚ, protože žádná zatím neexistuje a archivní dávky z roku 2022 už ČSÚ nevystavuje;
  - adaptér `lib/official-db.ts` a `db:official:apply` proti skutečnému Neonu, protože `OFFICIAL_RESULTS_DATABASE_URL` zatím není zřízená.
- Po první skutečné dávce zkontrolujte audit na stránce. Pokud parser dávku odmítne, opravte ho, zvyšte `PARSER_VERSION` v `lib/csu-okrsky.ts` a pusťte `--batch N`.
