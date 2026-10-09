// Team login: one shared password checked on the server, then an HMAC-signed, HttpOnly
// session cookie that carries the person's name for the audit trail.

import { cleanAuthorName } from "./manual-entries.ts";

export const SESSION_COOKIE = "p6_session";
export const SESSION_HOURS = 24;

export type TeamAuthConfig =
  | { kind: "disabled" }
  | { kind: "enabled"; password: string; secret: string }
  | { kind: "misconfigured"; reason: string };

// Auth is disabled only when neither variable is set (local development without a server store).
export function teamAuthFromEnv(env: Record<string, string | undefined> = process.env): TeamAuthConfig {
  const password = env.TEAM_PASSWORD ?? "";
  const secret = env.SESSION_SECRET ?? "";
  if (!password && !secret) return { kind: "disabled" };
  if (password.length < 10) return { kind: "misconfigured", reason: "TEAM_PASSWORD musí mít alespoň 10 znaků." };
  if (secret.length < 32) return { kind: "misconfigured", reason: "SESSION_SECRET musí mít alespoň 32 znaků." };
  return { kind: "enabled", password, secret };
}

const encoder = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(value: string): Uint8Array {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(data)));
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

// Compares HMACs of both values so neither length nor content leaks through timing.
export async function passwordMatches(candidate: string, config: Extract<TeamAuthConfig, { kind: "enabled" }>): Promise<boolean> {
  const [expected, actual] = await Promise.all([hmac(config.secret, `pw:${config.password}`), hmac(config.secret, `pw:${candidate}`)]);
  return constantTimeEqual(expected, actual);
}

export async function createSessionToken(name: string, config: Extract<TeamAuthConfig, { kind: "enabled" }>, now = Date.now()): Promise<string> {
  const payload = base64url(encoder.encode(JSON.stringify({ n: name, e: now + SESSION_HOURS * 3_600_000 })));
  return `${payload}.${base64url(await hmac(config.secret, payload))}`;
}

export async function readSessionToken(token: string | undefined, config: Extract<TeamAuthConfig, { kind: "enabled" }>, now = Date.now()): Promise<{ name: string } | null> {
  if (!token) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  try {
    if (!constantTimeEqual(fromBase64url(signature), await hmac(config.secret, payload))) return null;
    const data = JSON.parse(new TextDecoder().decode(fromBase64url(payload))) as { n?: unknown; e?: unknown };
    const name = cleanAuthorName(data.n);
    if (!name || typeof data.e !== "number" || data.e <= now) return null;
    return { name };
  } catch {
    return null;
  }
}

export function readCookie(request: Request, name: string): string | undefined {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return undefined;
}

export function sessionCookie(request: Request, token: string | null): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return token
    ? `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_HOURS * 3600}${secure}`
    : `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}

// Writes must come from this site: SameSite=Strict already blocks cross-site cookies; this also
// refuses requests whose Origin is another host.
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function sessionFromRequest(request: Request, config: TeamAuthConfig): Promise<{ name: string } | null> {
  if (config.kind !== "enabled") return null;
  return readSessionToken(readCookie(request, SESSION_COOKIE), config);
}
