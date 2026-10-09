"use client";

import { useEffect, useMemo, useState } from "react";
import { PrecinctMap } from "../precinct-map";
import { AppShell, EmptyState, Kpi, ListName, Notice, SourceTag, StateTag } from "../ui";
import { ageLabel } from "../../lib/data-status";
import { initialVoteRows } from "../../lib/demo-data";
import { allocateDhondt } from "../../lib/dhondt";
import { computeForecast } from "../../lib/forecast";
import { officialForecastEntries, type OfficialDashboard } from "../../lib/official-results";
import "./official-results.css";

const formatNumber = new Intl.NumberFormat("cs-CZ");
function formatPercent(value: number) { return value.toLocaleString("cs-CZ", { maximumFractionDigits: 1, minimumFractionDigits: 1 }); }
function formatTime(iso: string | null | undefined) { return iso ? new Date(iso).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—"; }
function sourceHref(url: string) { return url.startsWith("https://volby.gov.cz/") ? url : undefined; }

const POLL_MS = 60_000;
const STALE_ATTEMPT_MS = 3 * 60_000;
const OFFICIAL_SEATS = 45;

type FeedView = { dashboard: OfficialDashboard; receivedAt: string } | null;

function connectionBanner(view: FeedView, loading: boolean, fetchFailed: boolean, now: number): { tone: "wait" | "warn" | "ok"; title: string; body: string } {
  if (!view) {
    if (loading) return { tone: "wait", title: "Načítám stav oficiálního importu…", body: "Dokud odpověď nepřijde, nezobrazuje se žádná hodnota jako oficiální." };
    return { tone: "warn", title: "Bez živého napojení", body: "Server s oficiální databází není dostupný (např. statický náhled). Nulové hodnoty níže neznamenají, že ČSÚ nic nevydal." };
  }
  const { dashboard } = view;
  if (dashboard.connection === "not_configured") return { tone: "warn", title: "Importér ani databáze nejsou zapojené", body: `${dashboard.connectionMessage} Nulové hodnoty níže jsou výchozí stav, ne potvrzení od ČSÚ.` };
  if (dashboard.connection === "unavailable") return { tone: "warn", title: "Oficiální databáze neodpovídá", body: dashboard.connectionMessage };
  const stale = fetchFailed ? " Poslední obnovení selhalo — údaje mohou být zastaralé." : "";
  const attempt = dashboard.lastAttempt;
  if (!attempt) return { tone: "warn", title: "Importér zatím neběžel", body: `Databáze je připojená, ale neobsahuje žádný pokus o stažení z ČSÚ. Spusťte npm run import:official.${stale}` };
  const attemptAge = now - Date.parse(attempt.attemptedAt);
  if (attemptAge > STALE_ATTEMPT_MS) return { tone: "warn", title: "Importér možná neběží", body: `Poslední dotaz na ČSÚ proběhl v ${formatTime(attempt.attemptedAt)} (před ${Math.round(attemptAge / 60_000)} min).${stale}` };
  if (!dashboard.latestBatch && attempt.outcome === "not_yet_available") return { tone: "wait", title: "ČSÚ zatím nevydal žádnou okrskovou dávku", body: `Poslední dotaz v ${formatTime(attempt.attemptedAt)}: ${attempt.detail ?? "dávka neexistuje"}. Importér se ptá každou minutu.${stale}` };
  if (attempt.outcome === "error") return { tone: "warn", title: "Poslední stažení z ČSÚ selhalo", body: `${formatTime(attempt.attemptedAt)}: ${attempt.detail ?? "neznámá chyba"}.${stale}` };
  const review = [dashboard.rejectedImports && `počet odmítnutých dávek ${dashboard.rejectedImports}`, dashboard.discrepancyPrecincts && `počet okrsků s rozporem ${dashboard.discrepancyPrecincts}`].filter(Boolean).join(", ");
  return { tone: fetchFailed || review ? "warn" : "ok", title: review ? `Živý import z ČSÚ · ke kontrole ${review}` : "Živý import z ČSÚ", body: `Poslední dotaz v ${formatTime(attempt.attemptedAt)} (${attempt.outcome === "stored" ? "uložena nová dávka" : "nic nového"}).${stale}` };
}

export default function OfficialResultsClient({ initialDashboard, totalPrecincts }: { initialDashboard: OfficialDashboard; totalPrecincts: number }) {
  const [view, setView] = useState<FeedView>(null);
  const [loading, setLoading] = useState(true);
  const [fetchFailed, setFetchFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const response = await fetch("/api/official-results", { cache: "no-store" });
        const contentType = response.headers.get("content-type") ?? "";
        if (!contentType.includes("application/json") || response.status === 401 || response.status === 500) throw new Error(`HTTP ${response.status}`);
        const dashboard = await response.json() as OfficialDashboard;
        if (cancelled) return;
        // A 503 still carries an honest "unavailable" dashboard; keep the last good data visible but flagged.
        setView((previous) => response.ok || !previous ? { dashboard, receivedAt: new Date().toISOString() } : previous);
        setFetchFailed(!response.ok);
      } catch {
        if (!cancelled) setFetchFailed(true);
      } finally {
        if (!cancelled) { setLoading(false); setNow(Date.now()); }
      }
    }
    refresh();
    const timer = window.setInterval(refresh, POLL_MS);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  const dashboard = view?.dashboard ?? initialDashboard;
  const entries = useMemo(() => officialForecastEntries(dashboard), [dashboard]);
  const totalVotes = entries.reduce((sum, entry) => sum + entry.validVotes, 0);
  const listIds = initialVoteRows.map((row) => row.id);
  const currentRows = useMemo(() => initialVoteRows.map((row, index) => ({ ...row, votes: entries.reduce((sum, entry) => sum + (entry.listVotes[index] ?? 0), 0) })), [entries]);
  const allocation = useMemo(() => allocateDhondt(currentRows, OFFICIAL_SEATS), [currentRows]);
  const forecast = useMemo(() => computeForecast(listIds, entries, OFFICIAL_SEATS), [entries, listIds]);
  const banner = connectionBanner(view, loading, fetchFailed, now);
  const queue = dashboard.precincts.filter((precinct) => precinct.validationStatus === "discrepancy" || precinct.resent);
  const rejected = dashboard.imports.filter((summary) => summary.status === "rejected");

  const flags = new Map(dashboard.precincts.filter((precinct) => precinct.validationStatus === "discrepancy").map((precinct) => [precinct.precinctNumber, "discrepancy" as const]));
  const counting = dashboard.processedPrecincts === 0 ? "čeká na data" : dashboard.processedPrecincts < totalPrecincts ? "neúplné sčítání" : "sečteno";
  const bandStatus = <>
    <StateTag tone={dashboard.latestBatch ? "ok" : "wait"}>{dashboard.latestBatch ? `poslední import ${formatTime(dashboard.latestBatch.fetchedAt)}` : "zatím bez importu"}</StateTag>
    <StateTag tone={dashboard.processedPrecincts === totalPrecincts ? "ok" : dashboard.processedPrecincts ? "warn" : "wait"}>{counting} · {dashboard.processedPrecincts}/{totalPrecincts}</StateTag>
    {dashboard.discrepancyPrecincts > 0 && <StateTag tone="danger">rozpor k ověření: {dashboard.discrepancyPrecincts}</StateTag>}
    {rejected.length > 0 && <StateTag tone="danger">odmítnuté dávky: {rejected.map((summary) => `č. ${summary.batchNumber}`).join(", ")}</StateTag>}
  </>;

  return <AppShell output="official" status={bandStatus}>
    <div className="hero">
      <div className="eyebrow">Komunální volby 2026 · oficiální data ČSÚ / volby.gov.cz</div>
      <h1 className="title">Oficiální sčítání ČSÚ</h1>
      <p className="title-sub">Přijaté revize ČSÚ s auditem každé dávky.</p>
      <p className="lead">Jen přijaté oficiální revize z importu ČSÚ. Ruční zápisy z interního briefingu sem nevstupují a tato data nevstupují do nich.</p>
    </div>

    <Notice tone={banner.tone} title={banner.title} role="status"><span>{banner.body}</span>{view && <small>Stránka obnovena v {formatTime(view.receivedAt)} · další obnovení do 60 s</small>}</Notice>

    <section className="kpis kpis--verified" aria-label="Souhrn oficiálního sčítání">
      <Kpi primary label="Oficiálně zpracováno" value={`${dashboard.processedPrecincts} / ${totalPrecincts}`} note={<>{formatPercent(dashboard.coveragePercent)} % okrsků · {counting} · <SourceTag kind="official" /></>} />
      <Kpi label="Poslední import ČSÚ" value={formatTime(dashboard.latestBatch?.fetchedAt)} note={dashboard.latestBatch ? `dávka č. ${dashboard.latestBatch.batchNumber} · ${ageLabel(dashboard.latestBatch.fetchedAt, now)}` : dashboard.lastAttempt ? `bez dávky · poslední dotaz ${formatTime(dashboard.lastAttempt.attemptedAt)}` : "importér zatím neběžel"} />
      {/* "Nothing to verify" only once the importer has actually run against a live database. */}
      {!view || !dashboard.lastAttempt
        ? <Kpi label="Rozpory · odmítnuté dávky" value="—" tone="wait" note={loading ? "načítám stav importu" : "bez importu nelze ověřit"} />
        : <Kpi label="Rozpory · odmítnuté dávky" value={`${dashboard.discrepancyPrecincts} · ${rejected.length}`} tone={dashboard.discrepancyPrecincts || rejected.length ? "danger" : "ok"} note={dashboard.discrepancyPrecincts || rejected.length ? "detail ve frontě k ověření níže" : "nic k ověření"} />}
      <Kpi label="Platné hlasy" value={formatNumber.format(totalVotes)} note="jen z přijatých okrsků" />
    </section>

    <div className="columns">
      <div className="stack">
        <PrecinctMap entries={entries} flags={flags} currentSource="oficiálně sečteno ČSÚ" title="Mapa oficiálně sečtených okrsků" badge={<SourceTag kind="official" />} updatedLabel={dashboard.latestBatch ? `import ${formatTime(dashboard.latestBatch.fetchedAt)}` : "zatím bez importu"} description="Oficiálně sečtený okrsek se vybarví podle vedoucí listiny. Nesečtené okrsky mají čárkovaný obrys, shoda na prvním místě zůstává neutrální a okrsky s rozporem jsou šrafované a nezapočítávají se." />

        <section className="panel" aria-labelledby="official-sum-title">
          <div className="section-head"><h2 className="sectiontitle" id="official-sum-title">Průběžný oficiální součet</h2><SourceTag kind="official" /></div>
          {entries.length === 0 ? <EmptyState title="Čeká na data ČSÚ">Žádný oficiálně sečtený okrsek zatím není k dispozici. Nulové hodnoty nejsou výsledek.</EmptyState> : <div className="data-table" role="table" aria-label="Oficiální součet podle listin">
            <div className="row headerrow" role="row"><span role="columnheader">Listina</span><span role="columnheader">Podíl</span><span role="columnheader">Hlasy</span><span role="columnheader">Mandáty*</span></div>
            {[...allocation].sort((left, right) => right.votes - left.votes).map((row) => <div className="row" role="row" key={row.id}>
              <b role="cell"><ListName label={row.label} colour={row.colour} /></b>
              <span role="cell" className="share-cell"><span><span className="row-label">Podíl</span>{formatPercent(row.share)} %</span><span className="bar-track" aria-hidden="true"><i className="bar" style={{ width: `${Math.min(100, row.share * 2)}%`, background: row.colour }} /></span></span>
              <span role="cell"><span className="row-label">Hlasy</span>{formatNumber.format(row.votes)}</span>
              <b role="cell"><span className="row-label">Mandáty</span>{row.seats}</b>
            </div>)}
          </div>}
          <p className="foot">* Průběžný přepočet 45 mandátů z dosud oficiálně sečtených okrsků; nepredikuje se do nesečtených okrsků a není to konečný výsledek.</p>
        </section>

        <section className="panel" aria-labelledby="audit-title">
          <div className="section-head"><h2 className="sectiontitle" id="audit-title">Audit importních dávek</h2><span className="badge">append-only · SHA-256 ze surových bajtů</span></div>
          {dashboard.imports.length === 0 ? <EmptyState title="Zatím žádná dávka">Každá stažená dávka se zde objeví s časem, stavem, otiskem a odkazem na zdroj.</EmptyState> : <div className="official-table" role="table" aria-label="Importní dávky ČSÚ">
            <div className="official-table-row official-table-head" role="row"><span role="columnheader">Dávka</span><span role="columnheader">Staženo</span><span role="columnheader">Stav</span><span role="columnheader">Okrsků P6</span><span role="columnheader">SHA-256 · zdroj</span></div>
            {dashboard.imports.map((summary) => <div className="official-table-row" role="row" key={`${summary.batchNumber}-${summary.sourceSha256}-${summary.parserVersion}`}>
              <span role="cell" data-label="dávka">{summary.batchNumber}</span>
              <span role="cell" data-label="staženo">{formatTime(summary.fetchedAt)}</span>
              <span role="cell">{summary.status === "accepted" ? <StateTag tone="ok">přijata</StateTag> : <><StateTag tone="danger">odmítnuta</StateTag> <small>{summary.rejectionReason}</small></>}</span>
              <span role="cell" data-label="okrsků P6">{summary.precinctCount}</span>
              <span role="cell" data-label="SHA-256" className="official-hash" title={`${summary.sourceSha256} · parser ${summary.parserVersion}`}>{summary.sourceSha256.slice(0, 12)}… · {sourceHref(summary.sourceUrl) ? <a href={sourceHref(summary.sourceUrl)} target="_blank" rel="noopener noreferrer">XML</a> : summary.sourceUrl}</span>
            </div>)}
          </div>}
        </section>
      </div>

      <aside className="stack" aria-label="Kontrola oficiálních dat">
        <section className="panel" aria-labelledby="queue-title">
          <div className="section-head"><h2 className="sectiontitle" id="queue-title">Fronta k ověření</h2><span className="badge">{queue.length + rejected.length}</span></div>
          {rejected.length === 0 && queue.length === 0 ? <EmptyState title="Nic k ověření">Žádné rozpory, odmítnuté dávky ani opakovaně zaslané okrsky.</EmptyState> : <>
            {rejected.length > 0 && <Notice tone="danger" title={`Odmítnuté dávky: ${rejected.map((summary) => `č. ${summary.batchNumber}`).join(", ")}`}><span>Jejich okrsky nejsou započtené a vyžadují kontrolu.</span></Notice>}
            <div className="audit">{queue.map((precinct) => <p key={precinct.precinctNumber}><b>Okrsek {precinct.precinctNumber}</b> · dávka {precinct.batchNumber}<br />{precinct.validationStatus === "discrepancy" && <><StateTag tone="danger">rozpor k ověření</StateTag> {precinct.validationNote} · nezapočteno<br /></>}{precinct.resent && <StateTag tone="warn">opakovaně zasláno</StateTag>}</p>)}</div>
          </>}
        </section>

        <section className="panel" aria-labelledby="official-model-title">
          <div className="section-head"><h2 className="sectiontitle" id="official-model-title">Model nad oficiálními daty</h2><SourceTag kind="model" /></div>
          <Notice tone="warn" title="Modelovaný odhad, ne oficiální výsledek"><span>Samostatná instance modelu pouze z bezrozporných oficiálních okrsků. Ruční zápisy do něj nevstupují.</span></Notice>
          {forecast ? <div className="data-table" style={{ marginTop: 12 }}>{forecast.lists.map((listForecast) => { const row = initialVoteRows.find((item) => item.id === listForecast.id)!; return <div className="row forecast-compact" key={row.id}><b><ListName label={row.label} colour={row.colour} /></b><span className="share-cell"><span>≈ {formatPercent(listForecast.pointShare)} %</span><span className="interval">{formatPercent(listForecast.p10Share)}–{formatPercent(listForecast.p90Share)} % · {listForecast.lowSeats}–{listForecast.highSeats} mand.</span></span></div>; })}</div> : <EmptyState title="Model je vypnutý">Zapne se až po prvním bezrozporném oficiálním okrsku. Do té doby nic nedopočítává.</EmptyState>}
        </section>
      </aside>
    </div>
  </AppShell>;
}
