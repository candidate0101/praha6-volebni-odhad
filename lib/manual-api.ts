// Request handlers behind /api/session and /api/manual-entries. Kept framework-free so the
// tests can drive them with plain Request objects and an in-memory Postgres.

import { cleanAuthorName, parseManualChange, type ManualEntriesLocalOnly, type ManualEntriesSnapshot } from "./manual-entries.ts";
import { appendManualChange, loadManualEntries, type ManualDb } from "./manual-store.ts";
import { createSessionToken, isSameOrigin, passwordMatches, sessionCookie, sessionFromRequest, type TeamAuthConfig } from "./team-session.ts";

export type ManualApiDeps = { db: ManualDb | null; auth: TeamAuthConfig };

const NO_STORE = { "cache-control": "no-store" };

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

// A shared store without a password would let anyone write; refuse instead of running open.
function configurationProblem(deps: ManualApiDeps): string | null {
  if (deps.auth.kind === "misconfigured") return deps.auth.reason;
  if (deps.db && deps.auth.kind === "disabled") return "Sdílené úložiště je nastavené, ale chybí TEAM_PASSWORD a SESSION_SECRET.";
  return null;
}

async function readJson(request: Request): Promise<unknown> {
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) return undefined;
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

export async function handleSessionGet(request: Request, deps: ManualApiDeps): Promise<Response> {
  const problem = configurationProblem(deps);
  if (problem) return json({ error: problem }, 500);
  if (deps.auth.kind === "disabled") return json({ required: false, authenticated: false, name: null });
  const session = await sessionFromRequest(request, deps.auth);
  return json({ required: true, authenticated: Boolean(session), name: session?.name ?? null });
}

export async function handleSessionPost(request: Request, deps: ManualApiDeps): Promise<Response> {
  const problem = configurationProblem(deps);
  if (problem) return json({ error: problem }, 500);
  if (deps.auth.kind !== "enabled") return json({ error: "Přihlášení není zapnuté." }, 400);
  if (!isSameOrigin(request)) return json({ error: "Požadavek z cizího původu." }, 403);
  const body = await readJson(request) as { password?: unknown; name?: unknown } | undefined;
  const name = cleanAuthorName(body?.name);
  if (!name) return json({ error: "Zadejte své jméno (1–60 znaků)." }, 400);
  if (typeof body?.password !== "string" || !(await passwordMatches(body.password, deps.auth))) {
    // Slows down guessing; serverless instances do not share memory for a real rate limit.
    await new Promise((resolve) => setTimeout(resolve, 800));
    return json({ error: "Heslo nesouhlasí." }, 401);
  }
  return json({ authenticated: true, name }, 200, { "set-cookie": sessionCookie(request, await createSessionToken(name, deps.auth)) });
}

export function handleSessionDelete(request: Request): Response {
  return json({ authenticated: false }, 200, { "set-cookie": sessionCookie(request, null) });
}

export async function handleEntriesGet(request: Request, deps: ManualApiDeps): Promise<Response> {
  const problem = configurationProblem(deps);
  if (problem) return json({ error: problem }, 500);
  if (!deps.db) return json({ mode: "local_only", reason: "Sdílené úložiště není nastavené (MANUAL_ENTRIES_DATABASE_URL chybí)." } satisfies ManualEntriesLocalOnly);
  if (!(await sessionFromRequest(request, deps.auth))) return json({ error: "Přihlaste se týmovým heslem." }, 401);
  try {
    const { entries, revisions } = await loadManualEntries(deps.db);
    return json({ mode: "server", entries, revisions, generatedAt: new Date().toISOString() } satisfies ManualEntriesSnapshot);
  } catch (error) {
    console.error("manual entries read failed", error);
    return json({ error: "Sdílené úložiště teď neodpovídá." }, 503);
  }
}

export async function handleEntriesPost(request: Request, deps: ManualApiDeps): Promise<Response> {
  const problem = configurationProblem(deps);
  if (problem) return json({ error: problem }, 500);
  if (!deps.db) return json({ error: "Sdílené úložiště není nastavené." }, 409);
  const session = await sessionFromRequest(request, deps.auth);
  if (!session) return json({ error: "Přihlaste se týmovým heslem." }, 401);
  if (!isSameOrigin(request)) return json({ error: "Požadavek z cizího původu." }, 403);
  const parsed = parseManualChange(await readJson(request));
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  try {
    const result = await appendManualChange(deps.db, parsed.change, session.name);
    if (result.status === "conflict") return json({ error: "conflict", current: result.current }, 409);
    return json({ revisionId: result.revisionId, replayed: result.status === "already_stored" });
  } catch (error) {
    console.error("manual entry write failed", error);
    return json({ error: "Zápis se nepodařilo uložit; zůstává v prohlížeči a zkusí se znovu." }, 503);
  }
}
