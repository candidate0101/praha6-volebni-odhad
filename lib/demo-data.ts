import type { VoteRow } from "./dhondt";
import { leaderColour } from "./election-map";

export const totalPrecincts = 104;
export const processedPrecincts = 0;
export const initialVoteRows: VoteRow[] = [
  { id: "l1", label: "STAROSTOVÉ A NEZÁVISLÍ", votes: 0, colour: leaderColour("l1") },
  { id: "l2", label: "GEN", votes: 0, colour: leaderColour("l2") },
  { id: "l3", label: "Komunistická strana Čech a Moravy", votes: 0, colour: leaderColour("l3") },
  { id: "l4", label: "Česká pirátská strana", votes: 0, colour: leaderColour("l4") },
  { id: "l5", label: "SPD s podporou Trikolory a PRO", votes: 0, colour: leaderColour("l5") },
  { id: "l6", label: "PRAHA 6 SOBĚ", votes: 0, colour: leaderColour("l6") },
  { id: "l7", label: "ODS a KDU-ČSL", votes: 0, colour: leaderColour("l7") },
  { id: "l8", label: "ANO 2011", votes: 0, colour: leaderColour("l8") },
  { id: "l9", label: "TOP 09", votes: 0, colour: leaderColour("l9") },
  { id: "l10", label: "Motoristé sobě a Svobodní", votes: 0, colour: leaderColour("l10") },
  { id: "l11", label: "JSME PRAHA 6", votes: 0, colour: leaderColour("l11") }
];
