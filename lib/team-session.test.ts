import { describe, expect, it } from "vitest";
import { createSessionToken, isSameOrigin, passwordMatches, readSessionToken, sessionCookie, teamAuthFromEnv } from "./team-session";

const config = { kind: "enabled" as const, password: "volebni-noc-2026", secret: "s".repeat(40) };

describe("team session", () => {
  it("is disabled only when neither variable is set and refuses weak settings", () => {
    expect(teamAuthFromEnv({})).toEqual({ kind: "disabled" });
    expect(teamAuthFromEnv({ TEAM_PASSWORD: "short", SESSION_SECRET: "s".repeat(40) }).kind).toBe("misconfigured");
    expect(teamAuthFromEnv({ TEAM_PASSWORD: "volebni-noc-2026" }).kind).toBe("misconfigured");
    expect(teamAuthFromEnv({ TEAM_PASSWORD: "volebni-noc-2026", SESSION_SECRET: "s".repeat(40) }).kind).toBe("enabled");
  });

  it("checks the password exactly", async () => {
    expect(await passwordMatches("volebni-noc-2026", config)).toBe(true);
    expect(await passwordMatches("volebni-noc-2027", config)).toBe(false);
    expect(await passwordMatches("", config)).toBe(false);
  });

  it("accepts its own token and rejects tampered, foreign or expired ones", async () => {
    const now = Date.parse("2026-10-10T12:00:00Z");
    const token = await createSessionToken("Jana Nováková", config, now);
    expect(await readSessionToken(token, config, now + 1000)).toEqual({ name: "Jana Nováková" });

    const [payload, signature] = token.split(".");
    const forgedPayload = Buffer.from(JSON.stringify({ n: "Útočník", e: now + 1e9 })).toString("base64url");
    expect(await readSessionToken(`${forgedPayload}.${signature}`, config, now)).toBeNull();
    expect(await readSessionToken(`${payload}.${signature}x`, config, now)).toBeNull();
    expect(await readSessionToken(token, { ...config, secret: "t".repeat(40) }, now)).toBeNull();
    expect(await readSessionToken(token, config, now + 25 * 3_600_000)).toBeNull();
  });

  it("sets an HttpOnly, SameSite=Strict cookie, Secure on https", () => {
    expect(sessionCookie(new Request("https://p6.example/api/session"), "abc")).toBe("p6_session=abc; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400; Secure");
    expect(sessionCookie(new Request("http://127.0.0.1:3026/api/session"), null)).toContain("Max-Age=0");
  });

  it("accepts writes only from the same origin", () => {
    const request = (origin?: string) => new Request("https://p6.example/api/manual-entries", { method: "POST", headers: origin ? { origin, host: "p6.example" } : { host: "p6.example" } });
    expect(isSameOrigin(request("https://p6.example"))).toBe(true);
    expect(isSameOrigin(request("https://evil.example"))).toBe(false);
    expect(isSameOrigin(request())).toBe(false);
  });
});
