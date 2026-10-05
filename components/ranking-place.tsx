import { Crown } from "lucide-react";

const podium = [
  { label: "золотая корона", badge: "bg-amber-50 text-amber-800 ring-amber-200", crown: "fill-amber-300 text-amber-700" },
  { label: "серебряная корона", badge: "bg-gray-50 text-gray-700 ring-gray-200", crown: "fill-gray-300 text-gray-600" },
  { label: "бронзовая корона", badge: "bg-orange-50 text-orange-900 ring-orange-200", crown: "fill-orange-300 text-orange-800" }
];

export default function RankingPlace({
  place,
  compact = false,
  crownOnly = false
}: {
  place: number | null | undefined;
  compact?: boolean;
  crownOnly?: boolean;
}) {
  if (place == null || !Number.isInteger(place) || place < 1) return null;
  const award = podium[place - 1];
  if (crownOnly && !award) return null;
  const label = `${place} место${award ? `, ${award.label}` : ""}`;

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center gap-0.5 rounded-md text-xs font-semibold ring-1 ring-inset ${
        compact ? "h-7 w-9" : "h-8 w-10"
      } ${award ? award.badge : "bg-slate-100 text-slate-700 ring-slate-200"}`}
      role="img"
      aria-label={label}
      title={label}
    >
      {award ? <Crown size={crownOnly ? 22 : 16} strokeWidth={1.75} className={award.crown} aria-hidden="true" /> : null}
      {!crownOnly ? <span aria-hidden="true">{place}</span> : null}
    </span>
  );
}
