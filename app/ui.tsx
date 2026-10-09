"use client";

import Link from "next/link";
import type { ReactNode } from "react";
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

export function Kpi({ label, value, note, accent }: { label: string; value: ReactNode; note?: ReactNode; accent?: boolean }) {
  return <div className={`kpi${accent ? " kpi--accent" : ""}`}><span>{label}</span><b>{compactDigits(value)}</b>{note && <small>{note}</small>}</div>;
}

export function ListName({ label, colour }: { label: string; colour: string }) {
  return <span className="list-name"><i className="swatch" style={{ background: colour }} aria-hidden="true" /><span>{label}</span></span>;
}

// Common header, navigation between the three outputs and the source band that says, before
// anything else, where the numbers on this page come from.
export function AppShell({ output, status, children }: { output: OutputId; status?: ReactNode; children: ReactNode }) {
  const { name, logout } = useTeamSession();
  const current = outputById(output);
  return <>
    <a className="skip-link" href="#obsah">Přeskočit na obsah</a>
    <header className="app-header">
      <div className="app-header-inner">
        <Link className="app-brand" href="/">Praha 6 <span>·</span> volební noc</Link>
        <nav className="app-nav" aria-label="Výstupy">
          {OUTPUTS.map((item) => <Link key={item.id} href={item.href} aria-current={item.id === output ? "page" : undefined}><span className="nav-long">{item.label}</span><span className="nav-short" aria-hidden="true">{item.shortLabel}</span></Link>)}
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
  </>;
}
