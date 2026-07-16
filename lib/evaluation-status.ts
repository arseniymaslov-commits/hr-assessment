export const MISSING_EVALUATION_LABEL = "Оценки нет";

export function isAutomaticMissingComment(comment?: string | null) {
  return String(comment || "")
    .toLowerCase()
    .includes("автоматически отмечено: оценка не заполнена");
}

export function isMissingEvaluation(evaluation: {
  score?: number | null;
  noInteraction?: boolean | null;
  comment?: string | null;
}) {
  return !evaluation.noInteraction && (evaluation.score == null || isAutomaticMissingComment(evaluation.comment));
}
