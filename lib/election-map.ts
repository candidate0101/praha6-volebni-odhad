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

export type PrecinctAppearance = {
  fill: string;
  leaderId: string | null;
  // Non-colour cue drawn over the fill: hatch = discrepancy to verify, dots = unsent manual entry.
  pattern: "hatch" | "dots" | null;
  label: string;
};

export function precinctAppearance(entry: { listVotes: number[] } | undefined, flag?: PrecinctFlag): PrecinctAppearance {
  if (flag === "discrepancy") return { fill: UNREPORTED_COLOUR, leaderId: null, pattern: "hatch", label: "rozpor k ověření" };
  if (!entry) return { fill: UNREPORTED_COLOUR, leaderId: null, pattern: null, label: "bez výsledku" };
  const leaderId = leadingListId(entry.listVotes);
  const base = leaderId ? null : "shoda na prvním místě";
  if (flag === "pending") return { fill: leaderColour(leaderId), leaderId, pattern: "dots", label: `${base ?? "vede listina"} · neodesláno` };
  return { fill: leaderColour(leaderId), leaderId, pattern: null, label: base ?? "vede listina" };
}
