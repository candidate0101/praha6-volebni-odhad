"use client";

import { FormEvent, useMemo, useState } from "react";
import { initialVoteRows, processedPrecincts, totalPrecincts } from "../lib/demo-data";
import { allocateDhondt, type VoteRow } from "../lib/dhondt";

type AuditItem = { precinct: string; source: string; at: string; status: string };

const formatNumber = new Intl.NumberFormat("cs-CZ");

export default function BriefingPage() {
  const [rows, setRows] = useState<VoteRow[]>(initialVoteRows);
  const [completed, setCompleted] = useState(processedPrecincts);
  const [showEntry, setShowEntry] = useState(false);
  const [precinct, setPrecinct] = useState("");
  const [validVotes, setValidVotes] = useState("");
  const [voteText, setVoteText] = useState("");
  const [message, setMessage] = useState("Čeká se na první zadaný okrsek. Do té doby jsou všechny hodnoty nulové.");
  const [audit, setAudit] = useState<AuditItem[]>([]);
  const [enteredPrecincts, setEnteredPrecincts] = useState(() => new Set<string>());
  const allocation = useMemo(() => allocateDhondt(rows, 45).sort((a, b) => b.votes - a.votes), [rows]);
  const totalVotes = rows.reduce((sum, row) => sum + row.votes, 0);
  const coverage = (completed / totalPrecincts) * 100;

  function submitPrecinct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = voteText.split(/[;,\s]+/).filter(Boolean).map(Number);
    const declaredValidVotes = Number(validVotes);
    if (enteredPrecincts.has(precinct)) {
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
    setRows((current) => current.map((row, index) => ({ ...row, votes: row.votes + parsed[index] })));
    setCompleted((current) => Math.min(totalPrecincts, current + 1));
    setEnteredPrecincts((current) => new Set(current).add(precinct));
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
        <div><span>Okrsky</span><b>{completed} / {totalPrecincts}</b></div><div><span>Zpracováno</span><b>{coverage.toFixed(1).replace(".", ",")} %</b></div><div><span>Platné hlasy</span><b>{formatNumber.format(totalVotes)}</b></div><div><span>Jistota modelu</span><b>není zapnuta</b></div>
      </section>
      <div className="columns">
        <section>
          <div className="section-head"><h2 className="sectiontitle">Průběžný součet a mandáty</h2><span className="badge">D&apos;Hondt · 45 míst</span></div>
          <div className="row headerrow"><span>Listina</span><span>Dosavadní podíl</span><span>Hlasy</span><span>Mandáty</span></div>
          {allocation.map((row) => <div className="row" key={row.id}><b>{row.label}</b><span>{row.share.toFixed(1).replace(".", ",")} % <i className="bar" style={{ width: `${Math.max(row.share ? 12 : 0, row.share * 2.2)}px`, background: row.colour }} /></span><span>{formatNumber.format(row.votes)}</span><b>{completed > 0 ? row.seats : "—"}</b></div>)}
          <p className="foot">{completed > 0 ? "Mandáty jsou průběžný přepočet čistě z vložených hlasů. Predikční interval ani jména kandidátů se nezobrazují, dokud nebude dokončena kalibrace a import kandidátních dat." : "Žádný okrsek ještě nebyl zadán — mandáty se dopočítají až po prvním zápisu."}</p>
        </section>
        <aside>
          <div className="note"><div className="eyebrow">Stav vstupů</div><b>{message}</b><br />Automatický import ČSÚ a historický model se připojí nad stejnou revizní stopu.</div>
          <button className="primary" onClick={() => setShowEntry((value) => !value)}>{showEntry ? "Zavřít zadání" : "Zadat okrsek"}</button>
          {showEntry && <form className="entry" onSubmit={submitPrecinct}>
            <label>Číslo okrsku<input value={precinct} onChange={(event) => setPrecinct(event.target.value)} inputMode="numeric" required /></label>
            <label>Platné hlasy<input value={validVotes} onChange={(event) => setValidVotes(event.target.value)} inputMode="numeric" required /></label>
            <label>Hlasy listin v pořadí 1–5<textarea value={voteText} onChange={(event) => setVoteText(event.target.value)} placeholder="120; 95; 70; 55; 40" required /></label>
            <small>Musí to být přesně pět čísel; jejich součet musí sedět na platné hlasy.</small><button className="secondary" type="submit">Uložit jako návrh</button>
          </form>}
          <div className="audit"><div className="eyebrow">Poslední auditní stopa</div>{audit.length === 0 ? <p>Zatím žádný zápis.</p> : audit.map((item, index) => <p key={`${item.precinct}-${index}`}><b>Okrsek {item.precinct}</b><br />{item.source} · {item.at} · <em>{item.status}</em></p>)}</div>
        </aside>
      </div>
    </div>
  </main>;
}
