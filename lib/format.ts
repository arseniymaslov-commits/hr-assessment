export const monthNames = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь"
];

export function periodLabel(period: { month: number; year: number }) {
  const assessedDate = new Date(period.year, period.month - 2, 1);
  const assessedMonth = new Intl.DateTimeFormat("ru-RU", {
    month: "long",
    timeZone: "Asia/Bishkek"
  }).format(assessedDate);
  return `Оценка взаимодействия СП за ${assessedMonth} ${assessedDate.getFullYear()}`;
}

export function periodShortLabel(period: { month: number; year: number }) {
  return `${monthNames[period.month - 1]} ${period.year}`;
}

export function scoreTone(score: number | null | undefined) {
  if (score == null) return "empty";
  if (score >= 9) return "ok";
  if (score >= 8) return "warn";
  return "risk";
}

export function scoreClass(score: number | null | undefined) {
  const tone = scoreTone(score);
  return {
    ok: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    warn: "bg-amber-50 text-amber-700 ring-amber-200",
    risk: "bg-red-50 text-red-700 ring-red-200",
    empty: "bg-slate-50 text-slate-500 ring-slate-200"
  }[tone];
}

export function fixed(value: number | null | undefined) {
  return value == null || Number.isNaN(value) ? "—" : value.toFixed(2);
}
