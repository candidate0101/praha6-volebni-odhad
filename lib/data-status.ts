// How fresh the numbers on a page are: newest timestamp and a short Czech age label.

export function latestIso(values: (string | null | undefined)[]): string | null {
  let latest: string | null = null;
  for (const value of values) if (value && (!latest || Date.parse(value) > Date.parse(latest))) latest = value;
  return latest;
}

export function ageLabel(iso: string | null | undefined, now: number): string {
  if (!iso) return "zatím nic";
  const seconds = Math.floor((now - Date.parse(iso)) / 1000);
  if (seconds < 1) return "právě teď";
  if (seconds < 60) return `před ${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `před ${minutes} min`;
  return `před ${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}
