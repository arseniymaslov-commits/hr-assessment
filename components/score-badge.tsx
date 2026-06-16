import { scoreClass, fixed } from "@/lib/format";

export default function ScoreBadge({ score }: { score: number | null | undefined }) {
  return (
    <span className={`inline-flex min-w-16 justify-center rounded-full px-2.5 py-1 text-sm font-semibold ring-1 ${scoreClass(score)}`}>
      {fixed(score)}
    </span>
  );
}
