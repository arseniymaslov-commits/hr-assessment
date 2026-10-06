export type PresentationTrendPoint = {
  period: { id: string; month: number; year: number };
  average: number | null;
  count: number;
};

export function getPresentationTrend(points: PresentationTrendPoint[], selectedPeriodId: string) {
  const sorted = [...points].sort((a, b) => a.period.year - b.period.year || a.period.month - b.period.month);
  const selectedIndex = sorted.findIndex((point) => point.period.id === selectedPeriodId);
  return selectedIndex < 0 ? [] : sorted.slice(Math.max(0, selectedIndex - 5), selectedIndex + 1);
}

export function presentationTrendDelta(points: PresentationTrendPoint[]) {
  const current = points.at(-1);
  const previous = points.at(-2);
  return current?.average != null && previous?.average != null ? current.average - previous.average : null;
}
