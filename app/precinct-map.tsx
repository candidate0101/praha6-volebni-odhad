"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import precinctGeojson from "../data/normalized/praha6-precincts-2026.geo.json";
import { initialVoteRows } from "../lib/demo-data";
import { totalPrecincts } from "../lib/demo-data";
import { leaderLegend, precinctAppearance, PROCESSED_STATUS_COLOUR, summarizeMap, UNREPORTED_COLOUR, type MapView, type PrecinctFlag } from "../lib/election-map";
import type { EnteredPrecinct } from "../lib/forecast";
import { currentPrecinctResult, historicalPrecinctResult, HISTORY_YEARS, type PrecinctResult } from "../lib/precinct-history";

type Position = [number, number];
type PrecinctFeature = {
  properties: { id: string; title: string };
  geometry: { type: "Polygon"; coordinates: Position[][] };
};

const features = precinctGeojson.features as unknown as PrecinctFeature[];
const allPositions = features.flatMap((feature) => feature.geometry.coordinates.flat());
const minLongitude = Math.min(...allPositions.map(([longitude]) => longitude));
const maxLongitude = Math.max(...allPositions.map(([longitude]) => longitude));
const minLatitude = Math.min(...allPositions.map(([, latitude]) => latitude));
const maxLatitude = Math.max(...allPositions.map(([, latitude]) => latitude));
const MAP_WIDTH = 1000;
const MAP_HEIGHT = ((maxLatitude - minLatitude) / ((maxLongitude - minLongitude) * Math.cos(((minLatitude + maxLatitude) / 2) * Math.PI / 180))) * MAP_WIDTH;

function point([longitude, latitude]: Position): string {
  const x = ((longitude - minLongitude) / (maxLongitude - minLongitude)) * MAP_WIDTH;
  const y = ((maxLatitude - latitude) / (maxLatitude - minLatitude)) * MAP_HEIGHT;
  return `${x.toFixed(2)} ${y.toFixed(2)}`;
}

function polygonPath(rings: Position[][]): string {
  return rings.map((ring) => `M ${ring.map(point).join(" L ")} Z`).join(" ");
}

// Projected shapes and a marker point (vertex average of the outer ring) for the selected precinct.
const shapes = features.map((feature) => {
  const outer = feature.geometry.coordinates[0].map((position) => point(position).split(" ").map(Number));
  const centre = outer.reduce(([sx, sy], [x, y]) => [sx + x / outer.length, sy + y / outer.length], [0, 0]);
  return { id: feature.properties.id, d: polygonPath(feature.geometry.coordinates), centre };
});

const number = new Intl.NumberFormat("cs-CZ");
const percent = (value: number) => value.toLocaleString("cs-CZ", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const TOP_ROWS = 5;

// One election in the precinct detail: turnout and votes, the strongest lists, the rest on demand.
function ResultColumn({ title, subtitle, result, empty }: { title: string; subtitle: string; result: PrecinctResult | null; empty: string }) {
  const meta = result ? [result.turnoutPercent !== null ? `účast ${percent(result.turnoutPercent)} %` : null, `${number.format(result.validVotes)} platných hlasů`].filter(Boolean).join(" · ") : null;
  const row = (item: PrecinctResult["rows"][number], index: number) => <li key={item.label} className={index === 0 && item.votes > 0 ? "is-first" : undefined}>
    <span className="result-name" title={item.label}>{item.colour && <i className="swatch" style={{ background: item.colour }} aria-hidden="true" />}{item.short ? <abbr title={item.label}>{item.short}</abbr> : item.label}</span>
    <span className="result-share">{percent(item.share)} %</span>
    <span className="bar-track" aria-hidden="true"><i className="bar" style={{ width: `${Math.min(100, item.share * 2)}%`, background: item.colour ?? "var(--muted)" }} /></span>
  </li>;
  return <div className="result-column">
    <h3><b>{title}</b><small>{subtitle}</small></h3>
    {!result ? <p className="result-empty">{empty}</p> : <>
      <p className="result-meta">{meta}</p>
      <ol className="result-rows">{result.rows.slice(0, TOP_ROWS).map(row)}</ol>
      {result.rows.length > TOP_ROWS && <details className="result-more"><summary>Další listiny ({result.rows.length - TOP_ROWS})</summary><ol className="result-rows" start={TOP_ROWS + 1}>{result.rows.slice(TOP_ROWS).map((item, index) => row(item, index + TOP_ROWS))}</ol></details>}
    </>}
  </div>;
}

const listLabel = (id: string | null) => (id ? initialVoteRows.find((row) => row.id === id)?.label : null) ?? null;

export function PrecinctMap({
  entries,
  onEditPrecinct,
  flags,
  title = "Mapa vedení v okrscích",
  badge,
  description = "Každý zpracovaný okrsek se vybarví podle listiny s nejvyšším počtem hlasů. Okrsky bez výsledku mají čárkovaný obrys, shoda na prvním místě zůstává neutrální.",
  updatedLabel,
  currentSource = "ruční zápis",
}: {
  entries: EnteredPrecinct[];
  onEditPrecinct?: (entry: EnteredPrecinct) => void;
  flags?: ReadonlyMap<number, PrecinctFlag>;
  title?: string;
  badge?: ReactNode;
  description?: string;
  updatedLabel?: string;
  // Where this page's 2026 numbers come from, shown in the precinct detail.
  currentSource?: string;
}) {
  const patternId = useId().replace(/:/g, "");
  const [selectedPrecinct, setSelectedPrecinct] = useState<string | null>(null);
  const entriesByNumber = useMemo(() => new Map(entries.map((entry) => [String(entry.number), entry])), [entries]);
  const [view, setView] = useState<MapView>("leader");
  const noFlags = useMemo(() => new Map<number, PrecinctFlag>(), []);
  const summary = summarizeMap(entries, flags ?? noFlags, totalPrecincts);
  const leaders = leaderLegend(entries, flags ?? noFlags);
  const selectedEntry = selectedPrecinct ? entriesByNumber.get(selectedPrecinct) : undefined;
  const selectedLook = selectedPrecinct ? precinctAppearance(selectedEntry, flags?.get(Number(selectedPrecinct)), view) : null;
  const selectedShape = shapes.find((shape) => shape.id === selectedPrecinct);

  // Full-screen view: the native Fullscreen API where the browser has it (hides browser chrome),
  // otherwise (e.g. iPhone Safari) a fixed overlay. Both use the same layout class.
  const sectionRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const [expanded, setExpanded] = useState(false);

  const collapse = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    setExpanded(false);
  }, []);

  function expand() {
    setExpanded(true);
    // The district is wide; on phones that support it (Android Chrome) turn the view to landscape.
    void sectionRef.current?.requestFullscreen?.()
      .then(() => (screen.orientation as ScreenOrientation & { lock?: (orientation: string) => Promise<void> }).lock?.("landscape"))
      .catch(() => undefined);
  }

  useEffect(() => {
    if (!expanded) return;
    const onFullscreenChange = () => { if (!document.fullscreenElement) setExpanded(false); };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") collapse(); };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("keydown", onKeyDown);
    const toggle = toggleRef.current;
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("keydown", onKeyDown);
      toggle?.focus();
    };
  }, [expanded, collapse]);

  function choose(id: string) {
    setSelectedPrecinct(id);
    const entry = entriesByNumber.get(id);
    // The edit form lives outside the map; in full screen only select and offer the edit explicitly.
    if (entry && !expanded) onEditPrecinct?.(entry);
  }

  function editSelected() {
    if (!selectedEntry) return;
    collapse();
    onEditPrecinct?.(selectedEntry);
  }

  const looks = shapes.map((shape) => ({ shape, look: precinctAppearance(entriesByNumber.get(shape.id), flags?.get(Number(shape.id)), view) }));
  const swatch = (fill: string, pattern?: "hatch" | "dots", dashed?: boolean) => <svg width="16" height="16" aria-hidden="true"><rect x="1" y="1" width="14" height="14" fill={fill} stroke={dashed ? "#7d7562" : "rgba(11,32,56,0.35)"} strokeDasharray={dashed ? "3 2" : undefined} />{pattern && <rect x="1" y="1" width="14" height="14" fill={`url(#${patternId}-${pattern})`} />}</svg>;

  return <section ref={sectionRef} className={`map-section${expanded ? " is-expanded" : ""}`} aria-labelledby={`${patternId}-title`} role={expanded ? "dialog" : undefined} aria-modal={expanded || undefined}>
    <div className="section-head"><h2 className="sectiontitle" id={`${patternId}-title`}>{title}</h2>{badge}</div>
    {expanded && <p className="map-rotate-hint">Pro větší mapu otočte telefon na šířku.</p>}
    <p className="foot" style={{ marginTop: 0 }}>{description} Kliknutím na okrsek (nebo Tab a Enter) zobrazíte jeho výsledky teď, v roce 2022 a 2018.{expanded && " Zpět zmenšíte tlačítkem „Zmenšit mapu“ nebo klávesou Esc."}</p>
    <div className="map-toolbar">
      <p className="map-status" aria-label="Stav okrsků na mapě">
        <span className="map-status-main"><b>{summary.processed}</b> / {totalPrecincts} zpracováno</span>
        <span>bez výsledku {summary.unreported}</span>
        {summary.discrepancy > 0 && <span className="map-status--danger"><span aria-hidden="true">× </span>rozpor {summary.discrepancy}</span>}
        {summary.pending > 0 && <span className="map-status--warn"><span aria-hidden="true">! </span>neodesláno {summary.pending}</span>}
        {updatedLabel && <span className="map-updated"><span aria-hidden="true">◷ </span>{updatedLabel}</span>}
      </p>
      <div className="map-tools">
        <div className="map-view-switch" role="group" aria-label="Zobrazení mapy">
          <button type="button" aria-pressed={view === "leader"} onClick={() => setView("leader")}>Vedení listin</button>
          <button type="button" aria-pressed={view === "status"} onClick={() => setView("status")}>Stav zpracování</button>
        </div>
        <button ref={toggleRef} type="button" className="map-toggle" onClick={expanded ? collapse : expand}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">{expanded
            ? <path d="M6 1v5H1M10 1v5h5M6 15v-5H1M10 15v-5h5" />
            : <path d="M1 6V1h5M15 6V1h-5M1 10v5h5M15 10v5h-5" />}</svg>
          {expanded ? "Zmenšit mapu" : "Celá obrazovka"}
        </button>
      </div>
    </div>
    <div className="map-plate">
      <svg className="precinct-map" viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} role="group" aria-label={`Mapa volebních okrsků Prahy 6 – ${view === "leader" ? "vedoucí listiny" : "stav zpracování"}`}>
        <defs>
          <pattern id={`${patternId}-hatch`} width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="9" height="9" fill="transparent" /><line x1="0" y1="0" x2="0" y2="9" stroke="#0b2038" strokeWidth="3.2" /></pattern>
          <pattern id={`${patternId}-dots`} width="9" height="9" patternUnits="userSpaceOnUse"><circle cx="4.5" cy="4.5" r="1.8" fill="#ffffff" stroke="#0b2038" strokeWidth="0.8" /></pattern>
        </defs>
        {looks.map(({ shape, look }) => {
          const leader = listLabel(look.leaderId);
          const label = `Okrsek ${shape.id}: ${leader ? `${leader} · ` : ""}${look.label}`;
          return <g key={shape.id}>
            <path className="precinct-shape" d={shape.d} fill={look.fill} tabIndex={0} role="button" aria-pressed={selectedPrecinct === shape.id} aria-label={label}
              onClick={() => choose(shape.id)}
              onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); choose(shape.id); } }}
            ><title>{label}</title></path>
            {look.pattern && <path className="precinct-overlay" d={shape.d} fill={`url(#${patternId}-${look.pattern})`} aria-hidden="true" />}
          </g>;
        })}
        {/* Outlines on top of all fills: dashed = no result yet; the selected precinct gets a heavy outline and a marker. */}
        <g aria-hidden="true">{looks.filter(({ look }) => look.outline === "dashed").map(({ shape }) => <path key={shape.id} className="precinct-dashed" d={shape.d} />)}</g>
        {selectedShape && <g aria-hidden="true" className="precinct-selected">
          <path d={selectedShape.d} />
          <circle cx={selectedShape.centre[0]} cy={selectedShape.centre[1]} r="7" /><circle className="precinct-selected-dot" cx={selectedShape.centre[0]} cy={selectedShape.centre[1]} r="2.6" />
        </g>}
      </svg>
      <div className="map-legend">
        <div>
          <b>{view === "leader" ? "Barvy listin · vede v okrscích" : "Zobrazení"}</b>
          <ul aria-label={view === "leader" ? "Listiny vedoucí v okrscích" : "Zobrazení stavu"}>
            {view === "status"
              ? <li>{swatch(PROCESSED_STATUS_COLOUR)}zpracováno (bez rozlišení listin)</li>
              : leaders.length === 0
                ? <li className="legend-empty">Barva listiny se sem přidá, jakmile listina vyhraje první okrsek.</li>
                : leaders.map((item) => <li key={item.id}>{swatch(item.colour)}{listLabel(item.id)} <span className="legend-count">{item.count}</span></li>)}
          </ul>
        </div>
        <div>
          <b>Stav okrsku</b>
          <ul aria-label="Stavy okrsků">
            <li>{swatch(UNREPORTED_COLOUR, undefined, true)}bez výsledku (čárkovaný obrys)</li>
            {view === "leader" && <li>{swatch(UNREPORTED_COLOUR)}shoda na 1. místě</li>}
            {summary.discrepancy > 0 && <li>{swatch(UNREPORTED_COLOUR, "hatch")}rozpor k ověření (šrafování)</li>}
            {summary.pending > 0 && <li>{swatch("#9aa9bb", "dots")}neodesláno (tečky)</li>}
            <li><svg width="16" height="16" aria-hidden="true"><rect x="1.5" y="1.5" width="13" height="13" fill="#fff" stroke="#0b2038" strokeWidth="3" /><circle cx="8" cy="8" r="2.5" fill="#0b2038" /></svg>vybraný okrsek</li>
          </ul>
        </div>
      </div>
    </div>
    <div className="map-detail" aria-live="polite">
      {selectedPrecinct && selectedLook ? <>
        <div className="map-detail-head">
          <b>Okrsek {selectedPrecinct}</b>
          <small>{selectedEntry ? `2026: ${listLabel(selectedLook.leaderId) ?? selectedLook.label}${selectedLook.state === "pending" ? " · neodesláno" : ""}` : selectedLook.state === "discrepancy" ? "2026: rozpor k ověření" : "2026: zatím bez výsledku"}</small>
          {expanded && selectedEntry && onEditPrecinct && <button type="button" className="btn btn--primary map-edit" onClick={editSelected}>Upravit zápis okrsku {selectedPrecinct}</button>}
        </div>
        <div className="map-detail-years">
          <ResultColumn title="2026 · teď" subtitle={currentSource} result={selectedEntry && selectedLook.state !== "discrepancy" ? currentPrecinctResult(selectedEntry, initialVoteRows) : null}
            empty={selectedLook.state === "discrepancy" ? "Okrsek se do součtu nezapočítává, dokud se rozpor neověří." : "Pro tento okrsek zatím nejsou data."} />
          {HISTORY_YEARS.map((year) => <ResultColumn key={year} title={String(year)} subtitle="oficiální výsledek ČSÚ" result={historicalPrecinctResult(year, selectedPrecinct)} empty="Okrsek v tomto roce neexistoval." />)}
        </div>
        <p className="map-detail-note">Okrsky se porovnávají podle čísla, hranice se mezi volbami mohly změnit. Listiny z let 2022 a 2018 jsou pod tehdejšími názvy a nejsou přepočítané na dnešní kandidátky.</p>
      </> : <p className="map-detail-head"><b>Vyberte okrsek na mapě</b><small>Ukážou se jeho výsledky teď, v roce 2022 a v roce 2018.</small></p>}
    </div>
  </section>;
}
