"use client";

import { useMemo, useState } from "react";
import candidateData from "../../data/candidates-2026.json";
import { allocateCouncilComposition, orderCandidatesByPreference } from "../../lib/council-composition";
import { initialVoteRows } from "../../lib/demo-data";
import { allocateDhondt } from "../../lib/dhondt";
import { computeForecast } from "../../lib/forecast";
import { ELECTED_STATUS_LABEL } from "../../lib/outputs";
import { BriefingAccessGate } from "../briefing-access-gate";
import { AppShell, EmptyState, Kpi, ListName, Notice, SourceTag, StateTag } from "../ui";
import { useManualEntries } from "../use-manual-entries";
import "./council-composition.css";

const number = new Intl.NumberFormat("cs-CZ");
const percent = (value: number) => value.toFixed(1).replace(".", ",");
type SourceMode = "model" | "current";
type Candidate = { list_id: string; list_name: string; ballot_order: number; name: string };
const candidates = candidateData.candidates as Candidate[];

export default function CouncilCompositionPage() {
  return <BriefingAccessGate><CouncilComposition /></BriefingAccessGate>;
}

function CouncilComposition() {
  // The same shared manual entries as the briefing on / (or this browser's, when no server store exists).
  const { entries } = useManualEntries();
  const [sourceMode, setSourceMode] = useState<SourceMode>("model");

  const listIds = initialVoteRows.map((row) => row.id);
  const currentRows = useMemo(() => initialVoteRows.map((row, index) => ({ ...row, votes: entries.reduce((sum, entry) => sum + (entry.listVotes[index] ?? 0), 0) })), [entries]);
  const forecast = useMemo(() => computeForecast(listIds, entries, 45), [entries, listIds]);
  const voteRows = useMemo(() => sourceMode === "model" && forecast
    ? initialVoteRows.map((row) => ({ ...row, votes: Math.round(forecast.lists.find((item) => item.id === row.id)?.pointVotes ?? 0) }))
    : currentRows, [currentRows, forecast, sourceMode]);
  const allocation = useMemo(() => allocateCouncilComposition(voteRows, 45, 0.05), [voteRows]);
  const elected = useMemo(() => allocation.flatMap((row) => orderCandidatesByPreference(
    candidates.filter((candidate) => candidate.list_id === row.id).map((candidate) => ({ listId: candidate.list_id, ballotOrder: candidate.ballot_order, name: candidate.name })),
    row.votes,
    [],
  ).slice(0, row.seats).map((candidate) => ({ ...candidate, listLabel: row.label }))), [allocation]);
  const totalVotes = voteRows.reduce((sum, row) => sum + row.votes, 0);
  const provisionalSeats = allocateDhondt(voteRows, 45);

  const modelUnavailable = sourceMode === "model" && !forecast;
  const seats = allocation.flatMap((row) => Array.from({ length: row.seats }, (_, index) => ({ id: `${row.id}-${index}`, colour: row.colour, label: row.label })));
  const sourceName = sourceMode === "model" ? "modelované listinné hlasy (Křišťálová koule)" : "průběžné ruční zápisy";

  return <AppShell output="council" status={<>
    <span className="tag tag--estimate">{sourceMode === "model" ? <><span className="tag-symbol" aria-hidden="true">≈</span>zdroj: model</> : <><span className="tag-symbol" aria-hidden="true">✎</span>zdroj: ruční zápisy</>}</span>
    <StateTag tone="wait">bez kandidátních hlasů</StateTag>
  </>}>
    <div className="hero">
      <div className="eyebrow">Komunální volby 2026 · předpokládané složení</div>
      <h1 className="title">Zastupitelstvo Prahy 6 · <em>pracovní odhad</em></h1>
      <p className="lead">Převod průběžných nebo modelovaných listinných hlasů do 45 mandátů. Nejde o oficiální výsledek ani o samostatnou prognózu „Křišťálové koule“.</p>
    </div>

    <Notice tone="method" title="Odhad podle pořadí kandidátky; může se změnit vlivem preferenčních hlasů.">
      <span>Dokud nejsou k dispozici kandidátní hlasy, nelze žádnou konkrétní osobu označit za definitivně zvolenou. Každá osoba níže je „{ELECTED_STATUS_LABEL}“.</span>
    </Notice>

    <section className="panel council-source" aria-labelledby="source-title">
      <h2 className="eyebrow" id="source-title">Zdroj listinných hlasů</h2>
      <div className="segmented" role="group" aria-label="Zdroj listinných hlasů">
        <button aria-pressed={sourceMode === "model"} onClick={() => setSourceMode("model")}>≈ Modelované listinné hlasy</button>
        <button aria-pressed={sourceMode === "current"} onClick={() => setSourceMode("current")}>✎ Průběžné ruční zápisy</button>
      </div>
      <p className="foot">Právě použito: <b>{sourceName}</b>. Oficiální výsledky ČSÚ se do tohoto odhadu nepromítají.</p>
    </section>

    <section className="kpis" aria-label="Souhrn odhadu">
      <Kpi label="Mandátů" value="45" note={<SourceTag kind="estimate" />} accent />
      <Kpi label="Vstupních hlasů" value={number.format(totalVotes)} note={sourceMode === "model" ? "≈ modelované" : "✎ ručně zapsané"} />
      <Kpi label="Listin nad 5 %" value={allocation.filter((row) => row.qualified).length} />
      <Kpi label="Předpokládaně zvolených" value={`${elected.length} / 45`} />
    </section>

    {modelUnavailable && <Notice tone="wait" title="Model zatím nemá vstup"><span>Po zadání prvního okrsku v interním briefingu se zde přepočítá pracovní odhad složení zastupitelstva.</span></Notice>}

    <div className="columns council-columns">
      <section className="panel" aria-labelledby="seats-title">
        <div className="section-head"><h2 className="sectiontitle" id="seats-title">Mandáty podle listinných hlasů</h2><span className="badge">D’Hondt · 45 mandátů · klauzule 5 %</span></div>
        {seats.length === 0 ? <EmptyState title="Čeká na listinné hlasy">Bez listinných hlasů nejsou přiděleny žádné mandáty.</EmptyState> : <div className="seat-grid" role="img" aria-label={allocation.filter((row) => row.seats > 0).map((row) => `${row.label}: ${row.seats}`).join(", ")}>{seats.map((seat) => <i key={seat.id} style={{ background: seat.colour }} title={seat.label} />)}</div>}
        <div className="data-table" role="table" aria-label="Mandáty podle listin">
          <div className="row headerrow" role="row"><span role="columnheader">Listina</span><span role="columnheader">Podíl / práh</span><span role="columnheader">Hlasy</span><span role="columnheader">Mandáty</span></div>
          {[...allocation].sort((left, right) => right.seats - left.seats || right.votes - left.votes).map((row) => <div className="row" role="row" key={row.id}>
            <b role="cell"><ListName label={row.label} colour={row.colour} /></b>
            <span role="cell" className="share-cell"><span><span className="row-label">Podíl</span>{percent(row.share)} % · {row.qualified ? "nad prahem" : <span className="interval">pod prahem</span>}</span><span className="bar-track" aria-hidden="true"><i className="bar" style={{ width: `${Math.min(100, row.share * 2)}%`, background: row.colour }} /></span></span>
            <span role="cell"><span className="row-label">Hlasy</span>{sourceMode === "model" ? "≈ " : ""}{number.format(row.votes)}</span>
            <b role="cell" className="num-big"><span className="row-label">Mandáty</span>{row.seats}</b>
          </div>)}
        </div>
        <p className="foot">Mandáty se počítají výhradně mezi listinami s alespoň 5 % z aktuálního vstupu. {provisionalSeats.some((row) => row.votes > 0) ? "Rozdělení se přepočítá při každé změně vstupních hlasů." : "Bez listinných hlasů nejsou přiděleny žádné mandáty."}</p>
      </section>

      <section className="panel" aria-labelledby="people-title">
        <div className="section-head"><h2 className="sectiontitle" id="people-title">Předpokládaně zvolení</h2><span className="badge">{elected.length} / 45 osob</span></div>
        <p className="foot" style={{ marginTop: 0 }}>Pořadí je převzato z kandidátních listin. Po importu kandidátních hlasů se kandidáti s nejméně 10 % hlasů své listiny přesunou před ostatní podle počtu preferenčních hlasů; ostatní zůstanou v původním pořadí.</p>
        {elected.length === 0 ? <EmptyState title="Zatím nikdo">Bez listinných hlasů nelze zobrazit žádné předpokládaně zvolené osoby.</EmptyState> : <ol className="candidate-list">{elected.map((candidate) => {
          const colour = initialVoteRows.find((row) => row.id === candidate.listId)?.colour ?? "#ffffff";
          return <li className="candidate-card" key={`${candidate.listId}-${candidate.ballotOrder}`}>
            <span className="candidate-name">{candidate.name}</span>
            <span className="candidate-meta"><ListName label={candidate.listLabel} colour={colour} /></span>
            <span className="candidate-order">{candidate.ballotOrder}. místo na kandidátce</span>
            <span className="candidate-status"><span aria-hidden="true">◇ </span>{ELECTED_STATUS_LABEL}</span>
          </li>;
        })}</ol>}
      </section>
    </div>
  </AppShell>;
}
