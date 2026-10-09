// The three separately labelled outputs of the app and the data sources each one shows.
// Every source has a text symbol and label so it is recognisable without colour.

export type SourceKindId = "manual" | "model" | "official" | "estimate";

export const SOURCE_KINDS: Record<SourceKindId, { symbol: string; label: string; description: string }> = {
  manual: { symbol: "✎", label: "Ruční zápisy", description: "Hodnoty z okrskových komisí zapsané týmem; nejsou oficiální." },
  model: { symbol: "≈", label: "Model", description: "Statistický odhad „Křišťálová koule“; není to výsledek." },
  official: { symbol: "✓", label: "Oficiální import ČSÚ", description: "Data ČSÚ / volby.gov.cz, uložená beze změn i s auditem." },
  estimate: { symbol: "◇", label: "Pracovní odhad", description: "Převod listinných hlasů na mandáty podle pořadí kandidátky." },
};

export type OutputId = "briefing" | "official" | "council";

export type OutputDefinition = {
  id: OutputId;
  href: string;
  label: string;
  shortLabel: string;
  // Context shown with the short navigation label, so "ČSÚ" or "Složení" never stands alone.
  navHint: string;
  sourceLine: string;
  sources: SourceKindId[];
};

export const OUTPUTS: OutputDefinition[] = [
  { id: "briefing", href: "/", label: "Interní briefing", shortLabel: "Briefing", navHint: "ruční zápisy + model", sourceLine: "Pracovní režim · ruční zápisy a modelovaný odhad · interní použití", sources: ["manual", "model"] },
  { id: "official", href: "/official-results", label: "Oficiální výsledky", shortLabel: "ČSÚ", navHint: "oficiální výsledky", sourceLine: "Oficiální import ČSÚ / volby.gov.cz", sources: ["official"] },
  { id: "council", href: "/predpokladane-slozeni", label: "Předpokládané složení", shortLabel: "Složení", navHint: "odhad mandátů", sourceLine: "Pracovní odhad 45 mandátů z průběžných nebo modelovaných listinných hlasů", sources: ["estimate"] },
];

export function outputById(id: OutputId): OutputDefinition {
  return OUTPUTS.find((output) => output.id === id)!;
}

// The only wording allowed for a candidate in the council estimate.
export const ELECTED_STATUS_LABEL = "předpokládaně zvolen/a";
