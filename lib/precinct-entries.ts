import type { EnteredPrecinct } from "./forecast";

export function removePrecinctEntry(current: EnteredPrecinct[], number: number): EnteredPrecinct[] {
  return current.filter((entry) => entry.number !== number);
}

export function savePrecinctEntry(current: EnteredPrecinct[], next: EnteredPrecinct): EnteredPrecinct[] {
  const index = current.findIndex((entry) => entry.number === next.number);
  if (index === -1) return [...current, next];
  return current.map((entry) => entry.number === next.number ? next : entry);
}
