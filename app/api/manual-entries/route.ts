// Shared manual entries for the whole team. Separate database from the official results.

import { handleEntriesGet, handleEntriesPost } from "../../../lib/manual-api.ts";
import { manualDbFromEnv } from "../../../lib/server-db.ts";
import { teamAuthFromEnv } from "../../../lib/team-session.ts";

export const dynamic = "force-dynamic";

const deps = () => ({ db: manualDbFromEnv(), auth: teamAuthFromEnv() });

export async function GET(request: Request) { return handleEntriesGet(request, deps()); }
export async function POST(request: Request) { return handleEntriesPost(request, deps()); }
