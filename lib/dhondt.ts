export type VoteRow = { id: string; label: string; votes: number; colour: string };
export type SeatResult = VoteRow & { seats: number; share: number };
export type QualifiedSeatResult = SeatResult & { qualified: boolean };

export const MUNICIPAL_THRESHOLD = 0.05;

export function allocateDhondt(rows: VoteRow[], seatCount: number): SeatResult[] {
  const total = rows.reduce((sum, row) => sum + row.votes, 0);
  const seats = new Map(rows.map((row) => [row.id, 0]));
  if (total > 0) {
    for (let seat = 0; seat < seatCount; seat += 1) {
      const winner = [...rows].sort((a, b) => {
        const aValue = a.votes / ((seats.get(a.id) ?? 0) + 1);
        const bValue = b.votes / ((seats.get(b.id) ?? 0) + 1);
        return bValue - aValue || b.votes - a.votes || a.label.localeCompare(b.label, "cs");
      })[0];
      seats.set(winner.id, (seats.get(winner.id) ?? 0) + 1);
    }
  }
  return rows.map((row) => ({ ...row, seats: seats.get(row.id) ?? 0, share: total ? (row.votes / total) * 100 : 0 }));
}

export function allocateMunicipalMandates(
  rows: VoteRow[],
  seatCount: number,
  threshold = MUNICIPAL_THRESHOLD,
): QualifiedSeatResult[] {
  const total = rows.reduce((sum, row) => sum + row.votes, 0);
  const qualifiedIds = new Set(
    rows
      .filter((row) => total > 0 && row.votes >= total * threshold)
      .map((row) => row.id),
  );
  const qualifiedAllocation = allocateDhondt(
    rows.filter((row) => qualifiedIds.has(row.id)),
    seatCount,
  );
  const seatsById = new Map(qualifiedAllocation.map((row) => [row.id, row.seats]));

  return rows.map((row) => ({
    ...row,
    seats: seatsById.get(row.id) ?? 0,
    share: total > 0 ? (row.votes / total) * 100 : 0,
    qualified: qualifiedIds.has(row.id),
  }));
}
