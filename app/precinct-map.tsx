"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import precinctGeojson from "../data/normalized/praha6-precincts-2026.geo.json";
import { initialVoteRows } from "../lib/demo-data";
import { leaderColour, precinctAppearance, UNREPORTED_COLOUR, type PrecinctFlag } from "../lib/election-map";
import type { EnteredPrecinct } from "../lib/forecast";

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

const listLabel = (id: string | null) => (id ? initialVoteRows.find((row) => row.id === id)?.label : null) ?? null;

export function PrecinctMap({
  entries,
  onEditPrecinct,
  flags,
  title = "Mapa vedení v okrscích",
  badge,
  description = "Každý zpracovaný okrsek se vybarví podle listiny s nejvyšším počtem hlasů. Okrsky bez výsledku a shoda na prvním místě zůstávají neutrální.",
}: {
  entries: EnteredPrecinct[];
  onEditPrecinct?: (entry: EnteredPrecinct) => void;
  flags?: ReadonlyMap<number, PrecinctFlag>;
  title?: string;
  badge?: ReactNode;
  description?: string;
}) {
  const patternId = useId().replace(/:/g, "");
  const [selectedPrecinct, setSelectedPrecinct] = useState<string | null>(null);
  const entriesByNumber = useMemo(() => new Map(entries.map((entry) => [String(entry.number), entry])), [entries]);
  const usedPatterns = new Set([...(flags?.values() ?? [])]);
  const selectedEntry = selectedPrecinct ? entriesByNumber.get(selectedPrecinct) : undefined;
  const selectedLook = selectedPrecinct ? precinctAppearance(selectedEntry, flags?.get(Number(selectedPrecinct))) : null;

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
    void sectionRef.current?.requestFullscreen?.().catch(() => undefined);
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

  return <section ref={sectionRef} className={`map-section${expanded ? " is-expanded" : ""}`} aria-labelledby={`${patternId}-title`} role={expanded ? "dialog" : undefined} aria-modal={expanded || undefined}>
    <div className="section-head"><h2 className="sectiontitle" id={`${patternId}-title`}>{title}</h2><span className="map-head-actions">{badge}
      <button ref={toggleRef} type="button" className="btn btn--secondary map-toggle" onClick={expanded ? collapse : expand}>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">{expanded
          ? <path d="M6 1v5H1M10 1v5h5M6 15v-5H1M10 15v-5h5" />
          : <path d="M1 6V1h5M15 6V1h-5M1 10v5h5M15 10v5h-5" />}</svg>
        {expanded ? "Zmenšit mapu" : "Celá obrazovka"}
      </button></span></div>
    <p className="foot" style={{ marginTop: 0 }}>{description} Okrsek vyberete kliknutím nebo klávesou Tab a Enter.{expanded && " Zpět zmenšíte tlačítkem „Zmenšit mapu“ nebo klávesou Esc."}</p>
    <div className="map-plate">
      <svg className="precinct-map" viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} role="group" aria-label="Mapa volebních okrsků Prahy 6">
        <defs>
          <pattern id={`${patternId}-hatch`} width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="9" height="9" fill="transparent" /><line x1="0" y1="0" x2="0" y2="9" stroke="#0b2038" strokeWidth="3.2" /></pattern>
          <pattern id={`${patternId}-dots`} width="9" height="9" patternUnits="userSpaceOnUse"><circle cx="4.5" cy="4.5" r="1.8" fill="#ffffff" stroke="#0b2038" strokeWidth="0.8" /></pattern>
        </defs>
        {features.map((feature) => {
          const id = feature.properties.id;
          const look = precinctAppearance(entriesByNumber.get(id), flags?.get(Number(id)));
          const leader = listLabel(look.leaderId);
          const label = `Okrsek ${id}: ${leader ? `${leader} · ` : ""}${look.label}`;
          const d = polygonPath(feature.geometry.coordinates);
          return <g key={id}>
            <path className="precinct-shape" d={d} fill={look.fill} tabIndex={0} role="button" aria-pressed={selectedPrecinct === id} aria-label={label}
              onClick={() => choose(id)}
              onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); choose(id); } }}
            ><title>{label}</title></path>
            {look.pattern && <path className="precinct-overlay" d={d} fill={`url(#${patternId}-${look.pattern})`} aria-hidden="true" />}
          </g>;
        })}
      </svg>
      <ul className="map-legend" aria-label="Legenda mapy">
        {initialVoteRows.map((row) => <li key={row.id}><i style={{ background: leaderColour(row.id) }} />{row.label}</li>)}
        <li><i style={{ background: UNREPORTED_COLOUR }} />bez výsledku / shoda</li>
        {usedPatterns.has("discrepancy") && <li><svg width="14" height="14" aria-hidden="true"><rect width="14" height="14" fill={UNREPORTED_COLOUR} /><rect width="14" height="14" fill={`url(#${patternId}-hatch)`} /></svg>šrafování = rozpor k ověření</li>}
        {usedPatterns.has("pending") && <li><svg width="14" height="14" aria-hidden="true"><rect width="14" height="14" fill="#9aa9bb" /><rect width="14" height="14" fill={`url(#${patternId}-dots)`} /></svg>tečky = neodesláno</li>}
      </ul>
    </div>
    <p className="map-selection" aria-live="polite">
      {selectedPrecinct && selectedLook
        ? <><b>Okrsek {selectedPrecinct}: {listLabel(selectedLook.leaderId) ?? selectedLook.label}</b><small>{selectedEntry ? `Platné hlasy ${selectedEntry.validVotes.toLocaleString("cs-CZ")} · ${selectedLook.label}` : selectedLook.label}</small></>
        : <><b>Vyberte okrsek na mapě</b><small>Detail vybraného okrsku se zobrazí zde.</small></>}
      {expanded && selectedEntry && onEditPrecinct && <button type="button" className="btn btn--primary map-edit" onClick={editSelected}>Upravit zápis okrsku {selectedPrecinct}</button>}
    </p>
  </section>;
}
