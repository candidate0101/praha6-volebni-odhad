"use client";

import { FormEvent, useMemo, useState } from "react";
import { initialVoteRows, totalPrecincts } from "../lib/demo-data";
import { allocateDhondt, type VoteRow } from "../lib/dhondt";
import { computeForecast, type EnteredPrecinct } from "../lib/forecast";

type AuditItem = { precinct: string; source: string; at: string; status: string };

const formatNumber = new Intl.NumberFormat("cs-CZ");
const SEAT_COUNT = 45;

function formatPercent(value: number): string {
  return value.toFixed(1).replace(".", ",");
}

export default function BriefingPage() {
  const [entries, setEntries] = useState<EnteredPrecinct[]>([]);
  const [showEntry, setShowEntry] = useState(false);
  const [precinct, setPrecinct] = useState("");
  const [validVotes, setValidVotes] = useState("");
  const [voteText, setVoteText] = useState("");
  const [message, setMessage] = useState("Čeká se na první zadaný okrsek. Do té doby jsou všechny hodnoty nulové.");
  const [audit, setAudit] = useState<AuditItem[]>([]);

  const listIds = initialVoteRows.map((row) => row.id);
  const enteredNumbers = useMemo(() => new Set(entries.map((entry) => entry.number)), [entries]);
  const completed = entries.length;
  const coverage = (completed / totalPrecincts) * 100;

  const rows: VoteRow[] = useMemo(
    () => initialVoteRows.map((row, index) => ({
      ...row,
      votes: entries.reduce((sum, entry) => sum + entry.listVotes[index], 0),
    })),
    [entries],
  );
  const allocation = useMemo(() => allocateDhondt(rows, SEAT_COUNT).sort((a, b) => b.votes - a.votes), [rows]);
  const totalVotes = rows.reduce((sum, row) => sum + row.votes, 0);

  const forecast = useMemo(() => computeForecast(listIds, entries, SEAT_COUNT), [listIds, entries]);
  const forecastById = useMemo(() => new Map((forecast?.lists ?? []).map((list) => [list.id, list])), [forecast]);

  function submitPrecinct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = voteText.split(/[;,\s]+/).filter(Boolean).map(Number);
    const declaredValidVotes = Number(validVotes);
    const precinctNumber = Number(precinct);
    if (enteredNumbers.has(precinctNumber)) {
      setMessage(`Okrsek ${precinct} už má záznam. Nová hodnota musí vzniknout jako řízená revize.`);
      return;
    }
    if (!/^\d+$/.test(precinct) || parsed.length !== rows.length || parsed.some((vote) => !Number.isInteger(vote) || vote < 0)) {
      setMessage(`Zadej číslo okrsku a přesně ${rows.length} nezáporných celých hodnot.`);
      return;
    }
    if (!Number.isInteger(declaredValidVotes) || parsed.reduce((sum, vote) => sum + vote, 0) !== declaredValidVotes) {
      setMessage("Součet hlasů listin musí přesně odpovídat počtu platných hlasů.");
      return;
    }
    setEntries((current) => [...current, { number: precinctNumber, validVotes: declaredValidVotes, listVotes: parsed }]);
    setAudit((current) => [{ precinct, source: "ruční zápis", at: new Date().toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" }), status: "návrh" }, ...current]);
    setMessage(`Okrsek ${precinct} je uložen jako návrh; nic se nepřepisuje a čeká na kontrolu.`);
    setPrecinct(""); setValidVotes(""); setVoteText(""); setShowEntry(false);
  }

  return <main>
    <header className="header"><span className="brand">PRAHA 6 · INTERNÍ VOLEBNÍ BRIEFING</span><span className="time">Lokální pracovní prototyp · {completed}/{totalPrecincts} okrsků</span></header>
    <div className="wrap">
      <div className="eyebrow">Komunální volby 2026 · pracovní režim</div>
      <h1 className="title">Výsledek se zpřesňuje. Zatím nevyhlašujeme vítěze.</h1>
      <p className="lead">Skutečně zadané hodnoty a modelový výhled musí zůstat oddělené. Tohle je funkční základ pro zadávání, audit a transparentní přepočet mandátů.</p>
      <section className="ribbon" aria-label="Souhrn volební noci">
        <div><span>Okrsky</span><b>{completed} / {totalPrecincts}</b></div><div><span>Zpracováno</span><b>{formatPercent(coverage)} %</b></div><div><span>Platné hlasy</span><b>{formatNumber.format(totalVotes)}</b></div><div><span>Jistota modelu</span><b>{forecast ? forecast.confidenceLabel : "není zapnuta"}</b></div>
      </section>
      <div className="columns">
        <section>
          <div className="section-head"><h2 className="sectiontitle">Skutečný dosavadní stav</h2><span className="badge">D&apos;Hondt z doteď zadaných okrsků</span></div>
          <div className="row headerrow"><span>Listina</span><span>Dosavadní podíl</span><span>Hlasy</span><span>Mandáty</span></div>
          {allocation.map((row) => <div className="row" key={row.id}><b>{row.label}</b><span>{formatPercent(row.share)} % <i className="bar" style={{ width: `${Math.max(row.share ? 12 : 0, row.share * 2.2)}px`, background: row.colour }} /></span><span>{formatNumber.format(row.votes)}</span><b>{completed > 0 ? row.seats : "—"}</b></div>)}
          <p className="foot">{completed > 0 ? "Toto je čistě součet vložených okrsků — ne odhad celé Prahy 6." : "Žádný okrsek ještě nebyl zadán."}</p>

          <div className="section-head" style={{ marginTop: 32 }}><h2 className="sectiontitle">Modelový odhad finále Prahy 6</h2><span className="badge">Křišťálová koule z 2018 + 2022</span></div>
          {!forecast && <p className="foot">Model se zapne po zadání prvního okrsku. Do té doby nemá z čeho odhadnout zbylých {totalPrecincts} okrsků.</p>}
          {forecast && <>
            <div className="row headerrow"><span>Listina</span><span>Odhad podílu (80% pásmo)</span><span>Odhad hlasů</span><span>Mandáty (rozpětí)</span></div>
            {initialVoteRows.map((row) => {
              const listForecast = forecastById.get(row.id);
              if (!listForecast) return null;
              return <div className="row" key={row.id}>
                <b>{row.label}{!listForecast.hasHistory && <em style={{ marginLeft: 6, fontSize: 11 }}>bez historie</em>}</b>
                <span>{formatPercent(listForecast.pointShare)} % <i className="bar" style={{ width: `${Math.max(listForecast.pointShare ? 12 : 0, listForecast.pointShare * 2.2)}px`, background: row.colour }} /><br /><small>{formatPercent(listForecast.p10Share)}–{formatPercent(listForecast.p90Share)} %</small></span>
                <span>{formatNumber.format(Math.round(listForecast.pointVotes))}</span>
                <b>{listForecast.pointSeats}{listForecast.lowSeats !== listForecast.highSeats && <small> ({listForecast.lowSeats}–{listForecast.highSeats})</small>}</b>
              </div>;
            })}
            <p className="foot">Odhad počítá se zbývajícími {forecast.remainingPrecincts} okrsky na základě jejich vlastních výsledků z 2018 a 2022, posunu zjištěného v doteď zadaných okrscích a útlumu (shrinkage), aby první okrsky neurčily osud celé Prahy 6. Interval 80 % je analytická aproximace rozptylu, ne plná Monte Carlo simulace. Politická křížová mapa listin mezi 2018/2022/2026 je pracovní návrh — viz <code>data/list-crosswalk-2026.json</code> — a musí ji potvrdit tým.</p>
          </>}
        </section>
        <aside>
          <div className="note"><div className="eyebrow">Stav vstupů</div><b>{message}</b><br />Automatický import ČSÚ a historický model se připojí nad stejnou revizní stopu.</div>
          <button className="primary" onClick={() => setShowEntry((value) => !value)}>{showEntry ? "Zavřít zadání" : "Zadat okrsek"}</button>
          {showEntry && <form className="entry" onSubmit={submitPrecinct}>
            <label>Číslo okrsku<input value={precinct} onChange={(event) => setPrecinct(event.target.value)} inputMode="numeric" required /></label>
            <label>Platné hlasy<input value={validVotes} onChange={(event) => setValidVotes(event.target.value)} inputMode="numeric" required /></label>
            <label>Hlasy listin v pořadí 1–11<textarea value={voteText} onChange={(event) => setVoteText(event.target.value)} placeholder="120; 95; 70; 55; 40; 30; 25; 20; 15; 10; 5" required /></label>
            <small>Musí to být přesně {rows.length} čísel; jejich součet musí sedět na platné hlasy.</small><button className="secondary" type="submit">Uložit jako návrh</button>
          </form>}
          <div className="audit"><div className="eyebrow">Poslední auditní stopa</div>{audit.length === 0 ? <p>Zatím žádný zápis.</p> : audit.map((item, index) => <p key={`${item.precinct}-${index}`}><b>Okrsek {item.precinct}</b><br />{item.source} · {item.at} · <em>{item.status}</em></p>)}</div>
        </aside>
      </div>
    </div>
  </main>;
}
