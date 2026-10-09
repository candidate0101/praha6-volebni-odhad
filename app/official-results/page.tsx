import OfficialResultsClient from "./official-results-client";
import { BriefingAccessGate } from "../briefing-access-gate";
import { PRAHA6 } from "../../lib/csu-okrsky";
import { buildOfficialDashboard } from "../../lib/official-results";

const totalPrecincts = PRAHA6.lastPrecinct - PRAHA6.firstPrecinct + 1;

// The static shell carries no election figures. Live official data arrives only from
// /api/official-results; until it answers, the client says so instead of showing zeros as fact.
const initialDashboard = buildOfficialDashboard({ connection: "unavailable", connectionMessage: "Stav se načítá." }, totalPrecincts);

export default function OfficialResultsPage() {
  return <BriefingAccessGate><OfficialResultsClient initialDashboard={initialDashboard} totalPrecincts={totalPrecincts} /></BriefingAccessGate>;
}
