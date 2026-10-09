export const UNREPORTED_COLOUR = "#e7e1d2";

const coloursByListId: Record<string, string> = {
  l1: "#ec4899", // STAROSTOVÉ A NEZÁVISLÍ
  l2: "#436e98", // GEN
  l3: "#c62828", // KSČM
  l4: "#1f2937", // Piráti
  l5: "#6b7280", // SPD / Trikolora / PRO
  l6: "#f4c542", // PRAHA 6 SOBĚ
  l7: "#2563eb", // ODS a KDU-ČSL
  l8: "#65a30d", // ANO 2011
  l9: "#f97316", // TOP 09
  l10: "#7c3aed", // Motoristé sobě a Svobodní
  l11: "#0891b2", // JSME PRAHA 6
};

export function leadingListId(votes: number[]): string | null {
  const highest = Math.max(...votes, 0);
  if (highest === 0 || votes.filter((vote) => vote === highest).length !== 1) return null;
  return `l${votes.indexOf(highest) + 1}`;
}

export function leaderColour(listId: string | null): string {
  return listId ? (coloursByListId[listId] ?? UNREPORTED_COLOUR) : UNREPORTED_COLOUR;
}

export type PrecinctFlag = "discrepancy" | "pending";
export type MapView = "leader" | "status";
export type PrecinctState = "unreported" | "leader" | "tie" | "discrepancy" | "pending";

// Fill for every processed precinct in the processing view; deliberately not a party colour.
export const PROCESSED_STATUS_COLOUR = "#4b6a8f";

export type PrecinctAppearance = {
  fill: string;
  leaderId: string | null;
  // Non-colour cue drawn over the fill: hatch = discrepancy to verify, dots = unsent manual entry.
  pattern: "hatch" | "dots" | null;
  // Unreported precincts get a dashed outline so "no result yet" is visible without colour.
  outline: "dashed" | "solid";
  state: PrecinctState;
  label: string;
};

export function precinctAppearance(entry: { listVotes: number[] } | undefined, flag?: PrecinctFlag, view: MapView = "leader"): PrecinctAppearance {
  if (flag === "discrepancy") return { fill: UNREPORTED_COLOUR, leaderId: null, pattern: "hatch", outline: "solid", state: "discrepancy", label: "rozpor k ověření" };
  if (!entry) return { fill: UNREPORTED_COLOUR, leaderId: null, pattern: null, outline: "dashed", state: "unreported", label: "bez výsledku" };
  const leaderId = leadingListId(entry.listVotes);
  const base = leaderId ? null : "shoda na prvním místě";
  const fill = view === "status" ? PROCESSED_STATUS_COLOUR : leaderColour(leaderId);
  if (flag === "pending") return { fill, leaderId, pattern: "dots", outline: "solid", state: "pending", label: `${base ?? "vede listina"} · neodesláno` };
  return { fill, leaderId, pattern: null, outline: "solid", state: leaderId ? "leader" : "tie", label: base ?? "vede listina" };
}

type MapEntry = { number: number; listVotes: number[] };

export function summarizeMap(entries: MapEntry[], flags: ReadonlyMap<number, PrecinctFlag>, totalPrecincts: number) {
  const flagged = [...flags.values()];
  const discrepancy = flagged.filter((flag) => flag === "discrepancy").length;
  const processed = entries.filter((entry) => flags.get(entry.number) !== "discrepancy").length;
  return { processed, unreported: Math.max(0, totalPrecincts - processed - discrepancy), discrepancy, pending: flagged.filter((flag) => flag === "pending").length };
}

// Only the lists that actually lead a precinct, so the legend stays short during the night.
export function leaderLegend(entries: MapEntry[], flags: ReadonlyMap<number, PrecinctFlag>): { id: string; colour: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    if (flags.get(entry.number) === "discrepancy") continue;
    const leaderId = leadingListId(entry.listVotes);
    if (leaderId) counts.set(leaderId, (counts.get(leaderId) ?? 0) + 1);
  }
  const order = (id: string) => Number(id.slice(1));
  return [...counts].sort(([left, a], [right, b]) => b - a || order(left) - order(right)).map(([id, count]) => ({ id, colour: leaderColour(id), count }));
}
