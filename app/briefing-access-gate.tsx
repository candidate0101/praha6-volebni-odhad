"use client";

import { createContext, type FormEvent, type ReactNode, useContext, useEffect, useState } from "react";
import "./gate.css";

// The password is checked only on the server (/api/session); the browser never sees a hash.
type GateState =
  | { kind: "checking" }
  | { kind: "open"; name: string | null }
  | { kind: "login" }
  | { kind: "misconfigured"; message: string };

const TeamSessionContext = createContext<{ name: string | null; logout: () => Promise<void> }>({ name: null, logout: async () => {} });

export function useTeamSession() {
  return useContext(TeamSessionContext);
}

export function BriefingAccessGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>({ kind: "checking" });
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/session", { cache: "no-store" });
        if (!(response.headers.get("content-type") ?? "").includes("application/json")) throw new Error("no api");
        const body = await response.json() as { required?: boolean; authenticated?: boolean; name?: string | null; error?: string };
        if (cancelled) return;
        if (response.status === 500) setState({ kind: "misconfigured", message: body.error ?? "Server není správně nastavený." });
        else if (!body.required || body.authenticated) setState({ kind: "open", name: body.name ?? null });
        else setState({ kind: "login" });
      } catch {
        // No server API (static preview): the pages themselves say that nothing is shared.
        if (!cancelled) setState({ kind: "open", name: null });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function unlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, password }) });
      const body = await response.json() as { name?: string; error?: string };
      if (!response.ok) { setError(body.error ?? "Přihlášení se nezdařilo."); setPassword(""); return; }
      setState({ kind: "open", name: body.name ?? name });
    } catch {
      setError("Server neodpovídá. Zkuste to znovu.");
    } finally {
      setSubmitting(false);
    }
  }

  async function logout() {
    await fetch("/api/session", { method: "DELETE" }).catch(() => undefined);
    setPassword("");
    setState({ kind: "login" });
  }

  if (state.kind === "open") return <TeamSessionContext.Provider value={{ name: state.name, logout }}>{children}</TeamSessionContext.Provider>;
  if (state.kind === "checking") return <main className="gate"><p className="gate-ident"><span className="brand-mark">Výsledky <span className="brand-slash">/</span> Praha 6</span><span>Volební noc Praha 6 · interní nástroj</span></p><section className="gate-card"><div className="eyebrow">Interní volební briefing</div><p>Ověřuji přístup…</p></section></main>;
  if (state.kind === "misconfigured") return <main className="gate"><p className="gate-ident"><span className="brand-mark">Výsledky <span className="brand-slash">/</span> Praha 6</span><span>Volební noc Praha 6 · interní nástroj</span></p><section className="gate-card"><div className="eyebrow">Interní volební briefing</div><h1>Server není připravený</h1><p className="gate-error" role="alert">{state.message}</p></section></main>;

  return <main className="gate"><p className="gate-ident"><span className="brand-mark">Výsledky <span className="brand-slash">/</span> Praha 6</span><span>Volební noc Praha 6 · interní nástroj</span></p><section className="gate-card"><div className="eyebrow">Interní volební briefing</div><h1>Vstup pro tým</h1><p>Přihlaste se týmovým heslem.</p><form onSubmit={unlock}>
    <label>Vaše jméno<input autoFocus value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" maxLength={60} required aria-describedby="gate-audit" /></label>
    <p className="gate-audit" id="gate-audit"><b>Jméno je podpis do auditní stopy.</b> Každý zápis, úprava i smazání okrsku se uloží s tímto jménem a časem a celý tým je uvidí. Použijte skutečné jméno, ne přezdívku.</p>
    <label>Týmové heslo<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label>
    {error && <p className="gate-error" role="alert">{error}</p>}
    <button className="primary" type="submit" disabled={submitting}>{submitting ? "Ověřuji…" : "Vstoupit do briefingu"}</button>
  </form></section></main>;
}
