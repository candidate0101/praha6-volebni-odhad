"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { OUTPUTS, SOURCE_KINDS, outputById, type OutputId, type SourceKindId } from "../lib/outputs";
import { useTeamSession } from "./briefing-access-gate";

export type StateTone = "warn" | "danger" | "ok" | "wait" | "info";

const STATE_SYMBOL: Record<StateTone, string> = { warn: "!", danger: "×", ok: "✓", wait: "◷", info: "i" };

export function SourceTag({ kind }: { kind: SourceKindId }) {
  const source = SOURCE_KINDS[kind];
  return <span className={`tag tag--${kind}`} title={source.description}><span className="tag-symbol" aria-hidden="true">{source.symbol}</span>{source.label}</span>;
}

export function StateTag({ tone, children }: { tone: Exclude<StateTone, "info">; children: ReactNode }) {
  return <span className={`tag tag--${tone}`}><span className="tag-symbol" aria-hidden="true">{STATE_SYMBOL[tone]}</span>{children}</span>;
}

export function Notice({ tone, title, children, role }: { tone: StateTone | "method"; title: ReactNode; children?: ReactNode; role?: "status" | "alert" }) {
  const symbol = tone === "method" ? "◇" : STATE_SYMBOL[tone];
  return <div className={`notice notice--${tone}`} role={role}><span className="notice-symbol" aria-hidden="true">{symbol}</span><b>{title}</b>{children}</div>;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty-state"><b><span aria-hidden="true">◷ </span>{title}</b>{children}</div>;
}

// The condensed display face has a very wide no-break space; thousands get a narrow gap instead.
function compactDigits(value: ReactNode): ReactNode {
  if (typeof value !== "string" || !value.includes("\u00a0")) return value;
  return value.split("\u00a0").flatMap((part, index) => index === 0 ? [part] : [<span key={index} className="digit-gap" aria-hidden="true" />, part]);
}

// The first KPI on a page is the operational state and uses the display face; the rest are plain figures.
// A tone adds a symbol to the label, so "needs attention" never relies on colour.
export function Kpi({ label, value, note, primary, tone }: { label: string; value: ReactNode; note?: ReactNode; primary?: boolean; tone?: Exclude<StateTone, "info"> }) {
  return <div className={`kpi${primary ? " kpi--primary" : ""}${tone ? ` kpi--${tone}` : ""}`}>
    <span>{tone && <span className="kpi-symbol" aria-hidden="true">{STATE_SYMBOL[tone]} </span>}{label}</span>
    <b>{compactDigits(value)}</b>
    {note && <small>{note}</small>}
  </div>;
}

export function ListName({ label, colour }: { label: string; colour: string }) {
  return <span className="list-name"><i className="swatch" style={{ background: colour }} aria-hidden="true" /><span>{label}</span></span>;
}

// Current time for "před 3 min" labels; re-renders every few seconds, never on the server.
export function useNow(intervalMs = 10_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

// Common header, navigation between the three outputs and the source band that says, before
// anything else, where the numbers on this page come from.
// Simple line icons for the three working modes (no icon font, nothing external).
const MODE_ICON: Record<OutputId, ReactNode> = {
  briefing: <path d="M4 3h9l3 3v11H4zM7 8h6M7 11h6M7 14h3" />,
  official: <path d="M10 2l6 3v5c0 4-3 6.5-6 8-3-1.5-6-4-6-8V5zM7 10l2 2 4-4" />,
  council: <><circle cx="5" cy="13" r="1.6" /><circle cx="10" cy="13" r="1.6" /><circle cx="15" cy="13" r="1.6" /><circle cx="7.5" cy="8" r="1.6" /><circle cx="12.5" cy="8" r="1.6" /><path d="M3 17h14" /></>,
};

export function AppShell({ output, status, children }: { output: OutputId; status?: ReactNode; children: ReactNode }) {
  const { name, logout } = useTeamSession();
  const current = outputById(output);
  return <div className={`mode mode--${output}`}>
    <a className="skip-link" href="#obsah">Přeskočit na obsah</a>
    <header className="app-header">
      <div className="app-header-inner">
        <Link className="app-brand" href="/" aria-label="Výsledky Praha 6, volební noc 2026 – úvod">
          <span className="brand-mark" aria-hidden="true">Výsledky <span className="brand-slash">/</span> Praha 6</span>
          <span className="brand-desc" aria-hidden="true">volební noc 2026 · interní nástroj</span>
        </Link>
        <nav className="mode-switch" aria-label="Pracovní režimy">
          {OUTPUTS.map((item) => <Link key={item.id} className="mode-button" href={item.href} aria-current={item.id === output ? "page" : undefined} aria-label={`${item.shortLabel} – ${item.label}${item.label.toLowerCase().includes(item.navHint) ? "" : `, ${item.navHint}`}`}>
            <svg className="mode-icon" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">{MODE_ICON[item.id]}</svg>
            <span className="mode-text" aria-hidden="true"><b>{item.shortLabel}</b><small>{item.navHint}</small></span>
          </Link>)}
        </nav>
        {name && <span className="app-user">{name} · <button className="linklike" onClick={() => void logout()}>odhlásit</button></span>}
      </div>
    </header>
    <div className={`source-band source-band--${output}`} role="region" aria-label="Zdroj dat této stránky">
      <div className="source-band-inner">
        <span className="source-band-title">Zdroj dat:</span>
        {current.sources.map((kind) => <SourceTag key={kind} kind={kind} />)}
        <span className="source-band-line">{current.sourceLine}</span>
        {status}
      </div>
    </div>
    <main id="obsah" className="page">{children}</main>
  </div>;
}
