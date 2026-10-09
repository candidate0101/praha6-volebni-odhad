# Průběžný volební odhad Praha 6

Soukromý interní analytický nástroj pro volební večer komunálních voleb 2026.

## Startovní rozhodnutí (pracovní default)

- přístup: jen interní tým, jedno týmové heslo ověřované serverem a jméno u každého zápisu (viz `docs/team-deploy-netlify.md`);
- vstup MVP: ruční listinné hlasy + hromadné vložení; kandidátní hlasy až ve druhé fázi;
- zdroj: ruční zápis (`/`) a oficiální import ČSÚ (`/official-results`) jsou oddělené toky; oficiální data nevstupují do ručních záznamů ani do modelu na `/`;
- historie: každý výsledek je revize, nikdy přepis;
- politická křížová mapa listin: zatím **čeká na potvrzení týmu**.

## Stav

Funkční lokální prototyp obsahuje zadávání okrsků, mapu vedení, modelovaný odhad, kontrolu reprezentativnosti a historický stress test. Metodika a limity jsou v `docs/forecast-methodology-2026.md`; čísla v návrzích zůstávají demonstrační.

## Týmový provoz

Ruční zápisy se ukládají na sdílený server (Neon + Netlify), takže je vidí každý přihlášený a obnovení okna nic nesmaže. Oficiální výsledky ČSÚ mají vlastní databázi a importér. Nastavení a ověření jsou v `docs/team-deploy-netlify.md`, importér ČSÚ v `docs/official-results-import.md`.

## Ověřená datová zjištění

- ČSÚ má pro komunální volby 2026 k dispozici registry a číselníky (stav 26. 8. 2026).
- Finální okrsková open data (XML/CSV/JSON) zveřejní ČSÚ až po ukončení zpracování; během sčítání ale vydává průběžné okrskové XML dávky (`vysledky_okrsky_NNNNN.xml`, specifikace KV2026_XML v1.1 z 6. 10. 2026). Na ty je napojený importér, viz `docs/official-results-import.md`.
- Data z roku 2022 jsou dostupná včetně okrskových výsledků a GeoJSON hranic.

## Importovaná historie

Okrsková data pro **Prahu 6 (KODZASTUP 500178)** jsou normalizována v `data/normalized/`:

- `praha6-kv2018-precincts.json` — 104 okrsků, 11 listin, 1 648 147 platných hlasů;
- `praha6-kv2022-precincts.json` — 104 okrsků, 10 listin, 1 531 307 platných hlasů.

Každý záznam obsahuje souhrn okrsku, listinné hlasy a kandidátní hlasy. Manifest zachovává rozsah importu; JSON obsahuje adresy zdrojů ČSÚ a SHA-256 stažených archivů. Zdrojové ZIPy zůstávají lokálně v `data/raw/` a necommitují se.

Import lze opakovat příkazem `npm run import:history`.

Zdroj: https://volby.gov.cz/opendata/kv2026/kv2026_opendata.htm
