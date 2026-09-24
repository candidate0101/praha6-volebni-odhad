# Průběžný volební odhad Praha 6

Soukromý interní analytický nástroj pro volební večer komunálních voleb 2026.

## Startovní rozhodnutí (pracovní default)

- přístup: jen interní tým, přihlášení a role;
- vstup MVP: ruční listinné hlasy + hromadné vložení; kandidátní hlasy až ve druhé fázi;
- zdroj: ruční zápis a import ČSÚ rovnocenně, oficiální odlišnost se nejdřív posuzuje;
- historie: každý výsledek je revize, nikdy přepis;
- politická křížová mapa listin: zatím **čeká na potvrzení týmu**.

## Stav

Připraveny jsou tři vizuální směry dashboardu v `design-directions/`. Nejde o funkční výsledek ani předpověď; čísla v návrzích jsou záměrně demonstrační.

## Ověřená datová zjištění

- ČSÚ má pro komunální volby 2026 k dispozici registry a číselníky (stav 26. 8. 2026).
- Okrsková data 2026 mají být zveřejněna až po ukončení zpracování.
- Data z roku 2022 jsou dostupná včetně okrskových výsledků a GeoJSON hranic.

## Importovaná historie

Okrsková data pro **Prahu 6 (KODZASTUP 500178)** jsou normalizována v `data/normalized/`:

- `praha6-kv2018-precincts.json` — 104 okrsků, 11 listin, 1 648 147 platných hlasů;
- `praha6-kv2022-precincts.json` — 104 okrsků, 10 listin, 1 531 307 platných hlasů.

Každý záznam obsahuje souhrn okrsku, listinné hlasy a kandidátní hlasy. Manifest zachovává rozsah importu; JSON obsahuje adresy zdrojů ČSÚ a SHA-256 stažených archivů. Zdrojové ZIPy zůstávají lokálně v `data/raw/` a necommitují se.

Import lze opakovat příkazem `npm run import:history`.

Zdroj: https://volby.gov.cz/opendata/kv2026/kv2026_opendata.htm
