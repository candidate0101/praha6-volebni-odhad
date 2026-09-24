export type VoteRow = { id: string; label: string; votes: number; colour: string };
export type SeatResult = VoteRow & { seats: number; share: number };

export function allocateDhondt(rows: VoteRow[], seatCount: number): SeatResult[] {
  const seats = new Map(rows.map((row) => [row.id, 0]));
  for (let seat = 0; seat < seatCount; seat += 1) {
    const winner = [...rows].sort((a, b) => {
      const aValue = a.votes / ((seats.get(a.id) ?? 0) + 1);
      const bValue = b.votes / ((seats.get(b.id) ?? 0) + 1);
      return bValue - aValue || b.votes - a.votes || a.label.localeCompare(b.label, "cs");
    })[0];
    seats.set(winner.id, (seats.get(winner.id) ?? 0) + 1);
  }
  const total = rows.reduce((sum, row) => sum + row.votes, 0);
  return rows.map((row) => ({ ...row, seats: seats.get(row.id) ?? 0, share: total ? (row.votes / total) * 100 : 0 }));
}
