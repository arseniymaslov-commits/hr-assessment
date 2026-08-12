export const MIN_RANKING_EVALUATIONS = 3;

export type RankingCandidate = {
  name?: string;
  average: number | null;
  count: number;
  lowCount?: number;
  noInteractionCount?: number;
};

export function isRankingEligible(candidate: RankingCandidate) {
  return candidate.average != null && candidate.count >= MIN_RANKING_EVALUATIONS;
}

export function sortRankingCandidates<T extends RankingCandidate>(left: T, right: T) {
  const leftEligible = isRankingEligible(left);
  const rightEligible = isRankingEligible(right);
  if (leftEligible !== rightEligible) return leftEligible ? -1 : 1;

  if (left.average == null && right.average == null) {
    return (left.name || "").localeCompare(right.name || "", "ru");
  }
  if (left.average == null) return 1;
  if (right.average == null) return -1;

  if (right.average !== left.average) return right.average - left.average;
  if ((left.lowCount || 0) !== (right.lowCount || 0)) return (left.lowCount || 0) - (right.lowCount || 0);
  if ((left.noInteractionCount || 0) !== (right.noInteractionCount || 0)) {
    return (left.noInteractionCount || 0) - (right.noInteractionCount || 0);
  }
  if (right.count !== left.count) return right.count - left.count;
  return (left.name || "").localeCompare(right.name || "", "ru");
}
