export function historicalProfileType(shares: Array<number | null>, listIds: string[]): string {
  let winner = "neznamy";
  let highest = -1;
  shares.forEach((share, index) => {
    if (share !== null && share > highest) {
      highest = share;
      winner = listIds[index];
    }
  });
  return winner;
}

export function pooledSwing(citywideSwing: number, typeSwings: number[]): number {
  if (typeSwings.length === 0) return citywideSwing;
  const typeMean = typeSwings.reduce((sum, value) => sum + value, 0) / typeSwings.length;
  const localWeight = typeSwings.length / (typeSwings.length + 3);
  return citywideSwing * (1 - localWeight) + typeMean * localWeight;
}
