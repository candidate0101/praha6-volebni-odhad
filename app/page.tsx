"use client";

import { FormEvent, useMemo, useState } from "react";
import { initialVoteRows, totalPrecincts } from "../lib/demo-data";
import { allocateDhondt, type VoteRow } from "../lib/dhondt";
import { computeForecast, type EnteredPrecinct } from "../lib/forecast";
import { isPraha6Precinct } from "../lib/manual-entries";
import { validateSubmission } from "../lib/precinct-submission";
import { PRAHA6 } from "../lib/praha6";
import { BriefingAccessGate, useTeamSession } from "./briefing-access-gate";
import { PrecinctMap } from "./precinct-map";
import { ageLabel, latestIso } from "../lib/data-status";
import { AppShell, EmptyState, Kpi, ListName, Notice, SourceTag, StateTag, useNow } from "./ui";
import { useManualEntries, type ManualSyncMode } from "./use-manual-entries";

const formatNumber = new Intl.NumberFormat("cs-CZ");
const SEAT_COUNT = 45;

function formatPercent(value: number): string {
  return value.toFixed(1).replace(".", ",");
}

function formatClock(iso: string | null): string {
  return iso ? new Date(iso).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—";
}

const MODE_LABEL: Record<ManualSyncMode, string> = {
  loading: "Načítám sdílené zápisy…",
  server: "Sdílené zápisy týmu",
  offline: "Server nedostupný — zobrazen poslední známý stav",
  local_only: "Zápisy jen v tomto prohlížeči",
  signed_out: "Přihlášení vypršelo",
};

export default function BriefingPage() {
  return <BriefingAccessGate><Briefing /></BriefingAccessGate>;
}

function Briefing() {
  const { logout } = useTeamSession();
  const sync = useManualEntries();
  const entries = sync.entries;
  const [showEntry, setShowEntry] = useState(false);
  const [precinct, setPrecinct] = useState("");
  const [voteInputs, setVoteInputs] = useState<Record<string, string>>({});
  const [editingPrecinct, setEditingPrecinct] = useState<string | null>(null);
  const [editingRevision, setEditingRevision] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const now = useNow();

  const listIds = initialVoteRows.map((row) => row.id);
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

  function startEdit(clicked: EnteredPrecinct) {
    const entry = entries.find((item) => item.number === clicked.number) ?? clicked;
    // The revision the person is looking at; saving on top of a newer one is reported as a conflict.
    setEditingRevision("revisionId" in entry ? entry.revisionId as number | null : null);
    setEditingPrecinct(String(entry.number));
    setPrecinct(String(entry.number));
    setVoteInputs(Object.fromEntries(initialVoteRows.map((row, index) => [row.id, String(entry.listVotes[index])])));
    setShowEntry(true);
    setMessage(`Upravuješ okrsek ${entry.number}. Počet platných hlasů se znovu dopočítá z uložených hodnot.`);
  }

  function resetEntryForm() {
    setPrecinct("");
    setVoteInputs({});
    setEditingPrecinct(null);
    setEditingRevision(null);
  }

  function toggleEntryForm() {
    if (showEntry) resetEntryForm();
    setShowEntry((value) => !value);
  }

  function deletePrecinct() {
    if (!editingPrecinct || !window.confirm(`Opravdu smazat celý záznam okrsku ${editingPrecinct}?`)) return;
    sync.remove(Number(editingPrecinct), editingRevision);
    setMessage(`Smazání okrsku ${editingPrecinct} se ukládá${sync.mode === "local_only" ? " v tomto prohlížeči" : " na server"}.`);
    resetEntryForm();
    setShowEntry(false);
  }

  function submitPrecinct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = initialVoteRows.map((row) => {
      const value = voteInputs[row.id]?.trim();
      return value ? Number(value) : Number.NaN;
    });
    const validation = validateSubmission({
      precinctNumber: precinct,
      listVotes: parsed,
      expectedLists: rows.length,
      existingPrecincts: new Set(entries.map((entry) => String(entry.number))),
      editingPrecinct: editingPrecinct ?? undefined,
    });
    if (!validation.ok) {
      setMessage(validation.error);
      return;
    }
    const precinctNumber = Number(precinct);
    if (!isPraha6Precinct(precinctNumber)) {
      setMessage(`Okrsek musí být číslo ${PRAHA6.firstPrecinct}–${PRAHA6.lastPrecinct}.`);
      return;
    }
    const wasEditing = editingPrecinct !== null;
    sync.save(precinctNumber, parsed, wasEditing ? editingRevision : null);
    setMessage(`Okrsek ${precinct} je ${wasEditing ? "upraven" : "uložen"}${sync.mode === "local_only" ? " v tomto prohlížeči" : " a odesílá se na server"}; platné hlasy (${formatNumber.format(validation.validVotes)}) jsou dopočítány z listin.`);
    resetEntryForm(); setShowEntry(false);
  }

  const lastChange = latestIso([...sync.revisions.map((revision) => revision.createdAt), ...sync.outbox.map((item) => item.queuedAt)]);
  const pendingNumbers = new Set(sync.outbox.map((item) => item.change.precinctNumber));
  const mapFlags = new Map([...pendingNumbers].map((number) => [number, "pending" as const]));
  const syncTone = sync.mode === "server" && sync.outbox.length === 0 ? "ok" : sync.mode === "loading" ? "wait" : sync.mode === "local_only" ? "info" : "warn";
  const syncDetail = sync.mode === "server" ? `Všichni přihlášení vidí stejné zápisy. Synchronizováno v ${formatClock(sync.lastSyncAt)}, obnovuje se každých 5 s.`
    : sync.mode === "offline" ? `Poslední stav ze serveru: ${formatClock(sync.lastSyncAt)}. Nové zápisy se drží v tomto prohlížeči a odešlou se, jakmile se spojení obnoví.`
    : sync.mode === "local_only" ? "Sdílené úložiště není nastavené; zápisy vidí jen tento prohlížeč. Pro týmový provoz nastavte MANUAL_ENTRIES_DATABASE_URL."
    : sync.mode === "signed_out" ? "Relace vypršela. Neodeslané zápisy zůstávají v tomto prohlížeči; po přihlášení se odešlou."
    : "Načítám stav ze serveru.";

  return <AppShell output="briefing" status={<StateTag tone={syncTone === "info" ? "wait" : syncTone}>{MODE_LABEL[sync.mode]}</StateTag>}>
    <div className="hero">
      <div className="eyebrow">Komunální volby 2026 · interní volební briefing</div>
      <h1 className="title">Výsledek se zpřesňuje</h1>
      <p className="title-sub">Zatím nevyhlašujeme vítěze.</p>
      <p className="lead">Ruční zápisy z okrskových komisí a modelovaný odhad. Nic z této stránky není oficiální výsledek; oficiální data ČSÚ jsou na samostatné stránce a sem nevstupují.</p>
    </div>

    <Notice tone={syncTone} title={MODE_LABEL[sync.mode]} role="status">
      <span>{syncDetail}</span>
      {sync.conflicts.length > 0 && <span><b>Konflikty k vyřešení:</b> {sync.conflicts.map((conflict) => conflict.precinctNumber).join(", ")} — detail u formuláře.</span>}
      {sync.outbox.length > 0 && <span><b>Neodeslané zápisy:</b> {sync.outbox.map((item) => item.change.precinctNumber).join(", ")}</span>}
      {sync.mode === "signed_out" && <button className="btn btn--secondary" onClick={() => void logout()}>Přihlásit znovu</button>}
      {sync.legacyCount > 0 && sync.mode === "server" && <button className="btn btn--secondary" onClick={sync.uploadLegacy}>Nahrát {sync.legacyCount} dřívějších zápisů z tohoto prohlížeče na server</button>}
    </Notice>

    <section className="kpis" aria-label="Souhrn ručních zápisů">
      <Kpi primary label="Zadané okrsky" value={`${completed} / ${totalPrecincts}`} note={<>{formatPercent(coverage)} % okrsků · <SourceTag kind="manual" /></>} />
      <Kpi label="Poslední změna" value={formatClock(lastChange)} note={lastChange ? `${ageLabel(lastChange, now)} · synchronizace ${formatClock(sync.lastSyncAt)}` : completed ? "čas změny se v místním režimu neukládá" : "zatím žádný zápis"} />
      <Kpi label="Konflikty · neodesláno" value={`${sync.conflicts.length} · ${sync.outbox.length}`} tone={sync.conflicts.length ? "danger" : sync.outbox.length || sync.mode === "offline" || sync.mode === "signed_out" || sync.mode === "local_only" ? "warn" : sync.mode === "server" ? "ok" : "wait"}
        note={sync.conflicts.length ? `konflikt: ${sync.conflicts.map((conflict) => conflict.precinctNumber).join(", ")}` : sync.outbox.length ? "čeká na odeslání na server" : sync.mode === "server" ? "vše uloženo na serveru" : sync.mode === "local_only" ? "uloženo jen v tomto prohlížeči" : sync.mode === "loading" ? "načítám stav" : "server teď nepotvrzuje uložení"} />
      <Kpi label="Platné hlasy" value={formatNumber.format(totalVotes)} note={forecast ? `jistota modelu: ${forecast.confidenceLabel}` : "model se zapne po 1. okrsku"} />
    </section>

    <div className="columns">
      <div className="stack">
        <PrecinctMap entries={entries} flags={mapFlags} onEditPrecinct={startEdit} badge={<SourceTag kind="manual" />} updatedLabel={lastChange ? `poslední zápis ${formatClock(lastChange)}` : completed ? "místní zápisy bez času" : "zatím bez zápisu"} description="Okrsky se vybarví podle listiny vedoucí v ručním zápisu. Okrsky bez zápisu mají čárkovaný obrys, shoda na prvním místě zůstává neutrální a neodeslané zápisy mají tečky." />

        <section className="panel" aria-labelledby="current-title">
          <div className="section-head"><h2 className="sectiontitle" id="current-title">Skutečný dosavadní stav</h2><SourceTag kind="manual" /></div>
          {completed === 0 ? <EmptyState title="Čeká na první okrsek">Do zadání prvního okrsku jsou všechny hodnoty nulové.</EmptyState> : <div className="data-table" role="table" aria-label="Součet ručních zápisů podle listin">
            <div className="row headerrow" role="row"><span role="columnheader">Listina</span><span role="columnheader">Dosavadní podíl</span><span role="columnheader">Hlasy</span><span role="columnheader">Mandáty</span></div>
            {allocation.map((row) => <div className="row" role="row" key={row.id}>
              <b role="cell"><ListName label={row.label} colour={row.colour} /></b>
              <span role="cell" className="share-cell"><span><span className="row-label">Podíl</span>{formatPercent(row.share)} %</span><span className="bar-track" aria-hidden="true"><i className="bar" style={{ width: `${Math.min(100, row.share * 2)}%`, background: row.colour }} /></span></span>
              <span role="cell"><span className="row-label">Hlasy</span>{formatNumber.format(row.votes)}</span>
              <b role="cell"><span className="row-label">Mandáty</span>{row.seats}</b>
            </div>)}
          </div>}
          <p className="foot">Čistý součet vložených okrsků metodou D&apos;Hondt — ne odhad celé Prahy 6.</p>
        </section>

        <section className="panel" aria-labelledby="model-title">
          <div className="section-head"><h2 className="sectiontitle" id="model-title">Křišťálová koule · odhad finále</h2><SourceTag kind="model" /></div>
          <Notice tone="warn" title="Modelovaný odhad, ne výsledek"><span>Interní experiment s rokem 2022 jako hlavní kotvou. Nesmí se prezentovat jako oficiální ani jako jistý výsledek.</span></Notice>
          {!forecast && <EmptyState title="Model je vypnutý">Zapne se po zadání prvního okrsku. Do té doby nemá z čeho odhadnout zbylých {totalPrecincts} okrsků.</EmptyState>}
          {forecast && <>
            <p className="foot"><b>Kontrola použitelnosti modelu:</b> sečteno {forecast.coverageShare * 100 < 0.1 ? "<0,1" : formatPercent(forecast.coverageShare * 100)} % odhadovaných platných hlasů; historická odchylka zadaných okrsků od celé Prahy 6 je {formatPercent(forecast.representativenessGap * 100)} p. b. Štítek „{forecast.confidenceLabel}“ není pravděpodobnost výsledku.</p>
            <div className="data-table" role="table" aria-label="Modelovaný odhad podle listin">
              <div className="row headerrow" role="row"><span role="columnheader">Listina</span><span role="columnheader">Odhad podílu (80% pásmo)</span><span role="columnheader">Odhad hlasů</span><span role="columnheader">Mandáty (rozpětí)</span></div>
              {initialVoteRows.map((row) => {
                const listForecast = forecastById.get(row.id);
                if (!listForecast) return null;
                return <div className="row" role="row" key={row.id}>
                  <b role="cell"><ListName label={row.label} colour={row.colour} />{!listForecast.hasHistory && <small className="interval"> · bez historie</small>}</b>
                  <span role="cell" className="share-cell"><span><span className="row-label">Odhad</span>≈ {formatPercent(listForecast.pointShare)} %</span><span className="bar-track" aria-hidden="true"><i className="bar" style={{ width: `${Math.min(100, listForecast.pointShare * 2)}%`, background: row.colour, opacity: 0.75 }} /></span><span className="interval">{formatPercent(listForecast.p10Share)}–{formatPercent(listForecast.p90Share)} %</span></span>
                  <span role="cell"><span className="row-label">Hlasy</span>≈ {formatNumber.format(Math.round(listForecast.pointVotes))}</span>
                  <b role="cell"><span className="row-label">Mandáty</span>{listForecast.pointSeats}{listForecast.lowSeats !== listForecast.highSeats && <small className="interval"> ({listForecast.lowSeats}–{listForecast.highSeats})</small>}</b>
                </div>;
              })}
            </div>
            <p className="foot">Model používá jako hlavní historickou kotvu rok 2022; rok 2018 je jen záloha tam, kde srovnatelný údaj z roku 2022 chybí. Okrskové odchylky jsou váženy odmocninou počtu hlasů. Kontrola reprezentativnosti porovnává historický profil zadaných okrsků s celou Prahou 6. Pásmo 80 % je analytická aproximace, nikoli plná Monte Carlo simulace; nové či nesrovnatelné listiny mají slabší oporu. Politická křížová mapa listin je pracovní návrh a musí ji potvrdit tým.</p>
          </>}
        </section>
      </div>

      <aside className="stack" aria-label="Zápis okrsků">
        <section className="panel">
          <div className="section-head"><h2 className="sectiontitle">Zápis okrsku</h2><SourceTag kind="manual" /></div>
          <p className="foot" style={{ marginTop: 0 }} role="status">{message ?? (completed === 0 ? "Čeká se na první zadaný okrsek. Do té doby jsou všechny hodnoty nulové." : `Zapsáno ${completed} z ${totalPrecincts} okrsků. Okrsek upravíte v seznamu níže nebo kliknutím na mapu.`)}</p>
          {sync.conflicts.map((conflict, index) => <Notice key={`${conflict.precinctNumber}-${conflict.at}`} tone="danger" title={`Konflikt · okrsek ${conflict.precinctNumber}`} role="alert"><span>{conflict.message}{conflict.listVotes && ` Neuložené hodnoty: ${conflict.listVotes.join(", ")}.`}</span><button className="linklike" onClick={() => sync.dismissConflict(index)}>Beru na vědomí</button></Notice>)}
          <button className="btn btn--primary btn--block" style={{ marginTop: 12 }} onClick={toggleEntryForm} aria-expanded={showEntry}>{showEntry ? "Zavřít zadání" : "Zadat okrsek"}</button>
          {showEntry && <form className="entry" style={{ marginTop: 12 }} onSubmit={submitPrecinct}>
            <label>Číslo okrsku ({PRAHA6.firstPrecinct}–{PRAHA6.lastPrecinct})<input value={precinct} onChange={(event) => setPrecinct(event.target.value)} inputMode="numeric" disabled={editingPrecinct !== null} required /></label>
            <div className="party-votes">{initialVoteRows.map((row) => <label key={row.id}><ListName label={row.label} colour={row.colour} /><input value={voteInputs[row.id] ?? ""} onChange={(event) => setVoteInputs((current) => ({ ...current, [row.id]: event.target.value }))} inputMode="numeric" placeholder="0" required /></label>)}</div>
            <small className="interval">Vyplňte hlasy u každé listiny. Platné hlasy se dopočítají jako jejich součet.</small>
            <button className="btn btn--primary" type="submit">{editingPrecinct ? "Uložit úpravu" : "Uložit zápis"}</button>
            {editingPrecinct && <button className="btn--danger" type="button" onClick={deletePrecinct}>Smazat celý záznam</button>}
          </form>}
        </section>

        <section className="panel" aria-labelledby="entries-title">
          <div className="section-head"><h2 className="sectiontitle" id="entries-title">Vyplněné okrsky</h2><span className="badge">{completed}</span></div>
          {entries.length === 0 ? <EmptyState title="Zatím nic">První zapsaný okrsek se objeví zde.</EmptyState> : <div className="completed-precincts">{entries.map((entry) => <button className="precinct-edit" key={entry.number} onClick={() => startEdit(entry)}>Okrsek {entry.number}{pendingNumbers.has(entry.number) ? <StateTag tone="warn">neodesláno</StateTag> : entry.author && <small className="interval">{entry.author}</small>}<span className="action">upravit</span></button>)}</div>}
        </section>

        <section className="panel" aria-labelledby="audit-title">
          <div className="section-head"><h2 className="sectiontitle" id="audit-title">Auditní stopa</h2></div>
          <div className="audit">
            {sync.outbox.map((item) => <p key={item.change.clientId}><b>Okrsek {item.change.precinctNumber}</b><br />{item.change.action === "delete" ? "smazání" : item.change.basedOnRevision ? "úprava" : "zápis"} · {formatClock(item.queuedAt)} · <StateTag tone="warn">čeká na odeslání</StateTag></p>)}
            {sync.revisions.length === 0 && sync.outbox.length === 0 ? <EmptyState title="Bez záznamu">Každý zápis, úprava i smazání se zde objeví s autorem a časem.</EmptyState> : sync.revisions.map((revision) => <p key={revision.id}><b>Okrsek {revision.precinctNumber}</b><br />{revision.action === "delete" ? "smazání" : "zápis / úprava"} · {formatClock(revision.createdAt)} · {revision.author} · revize {revision.id}</p>)}
          </div>
          <p className="foot">Oficiální import ČSÚ má vlastní databázi a stránku a do těchto zápisů ani do modelu nevstupuje.</p>
        </section>
      </aside>
    </div>
  </AppShell>;
}
