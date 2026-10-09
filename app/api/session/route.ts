import { handleSessionDelete, handleSessionGet, handleSessionPost } from "../../../lib/manual-api.ts";
import { manualDbFromEnv } from "../../../lib/server-db.ts";
import { teamAuthFromEnv } from "../../../lib/team-session.ts";

export const dynamic = "force-dynamic";

const deps = () => ({ db: manualDbFromEnv(), auth: teamAuthFromEnv() });

export async function GET(request: Request) { return handleSessionGet(request, deps()); }
export async function POST(request: Request) { return handleSessionPost(request, deps()); }
export async function DELETE(request: Request) { return handleSessionDelete(request); }
