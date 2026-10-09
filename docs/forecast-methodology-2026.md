# Modelovaný průběžný odhad Praha 6 (pracovní metodika)

Stav: interní experiment. Není určen pro veřejné vyhlašování vítězů ani jako sociologická prognóza.

## Co model dělá

1. Použije pro každý okrsek srovnatelný výsledek z roku 2022 jako hlavní historickou kotvu. Rok 2018 je použit jen tehdy, pokud 2022 nemá srovnatelný subjekt.
2. Z již zadaných okrsků spočítá změnu podílů listin vůči jejich vlastní historii.
3. Změny váží odmocninou počtu platných hlasů: větší okrsek má větší, ale nikoli lineárně dominantní vliv.
4. U nezadaných okrsků částečně sdílí odchylku jen s okrsky stejného historického typu: typ určuje historicky vedoucí srovnatelná listina. Lokální odchylka se vždy ztlumí směrem k celopražskošestkovému průměru, takže jeden okrsek nevytvoří vlastní prognózu.
5. Doplní nezadané okrsky podle jejich historického profilu a pozorované změny, zpočátku utlumené faktorem n/(n+6).
6. Přepočte očekávané hlasy na 45 mandátů D'Hondtovou metodou.

## Kontrola použitelnosti

Vedle počtu okrsků se počítá:

- podíl zadaných platných hlasů na odhadovaném finálním počtu;
- historická reprezentativnost zadané množiny: průměrná absolutní odchylka historických podílů srovnatelných listin proti celé Praze 6.

Štítek nízká / střední / vyšší není pravděpodobnost. Vyšší se použije až při nejméně 25 okrscích, 20 % odhadovaných hlasů a historické odchylce nejvýše 3 p. b.; vysoká nereprezentativnost nad 6 p. b. vrací štítek na nízkou.

## Mandátová nejistota

Mandátové rozpětí vzniká z 1 000 deterministicky opakovatelných kompozičních simulací. Náhodné odchylky podílů jsou po losování normalizovány, takže všechny listiny dohromady vždy tvoří 100 % a každá simulace přidělí právě 45 mandátů.

Pásma podílů jsou nadále analytická aproximace. Simulace není kalibrovaný volební model.

## Historický stress test

`python3 scripts/backtest_forecast.py` vytváří `data/analysis/backtest-2018-to-2022.json`.

Test používá 2018 jako historii a postupně odkrývá skutečné okrsky 2022 ve čtyřech pořadích. Vyhodnocuje pouze přímo srovnatelné subjekty: Piráty, ANO a KSČM. Není to důkaz předvídatelnosti 2026; slouží jen jako kontrola chování extrapolace.

## Omezení a nutná sociologická kontrola

- Nové nebo koaličně proměněné subjekty nemají plnohodnotnou historickou kotvu.
- Model nezohledňuje sociální strukturu, lokální kampaně, kandidátní hlasy, skutečné pořadí hlášení komisí ani předvolební výzkum.
- Historická podobnost není náhradou za reprezentativní vzorek.
- Křížová mapa listin je pracovní interpretace a před ostrým využitím vyžaduje věcnou kontrolu týmu.
- Browser-local data a audit nejsou nemazatelný serverový záznam. Pro ostrý provoz je nutná přihlášená databáze s append-only revizemi.
