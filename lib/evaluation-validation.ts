import { isValidDeviationCategory } from "@/lib/evaluation-categories";

type EvaluationValidationInput = {
  noInteraction: boolean;
  score: number;
  comment: string;
  deviationCategories: string[];
};

export function validateEvaluationInput({
  noInteraction,
  score,
  comment,
  deviationCategories
}: EvaluationValidationInput) {
  if (noInteraction) return null;

  if (!Number.isInteger(score) || score < 1 || score > 10) {
    return "Оценка должна быть целым числом от 1 до 10";
  }

  if (score < 10 && !comment.trim()) {
    return "Для оценки ниже 10 комментарий обязателен";
  }

  if (score < 10 && deviationCategories.length === 0) {
    return "Для оценки ниже 10 выберите категорию отклонения";
  }

  if (deviationCategories.some((category) => !isValidDeviationCategory(category))) {
    return "Выбрана некорректная категория отклонения";
  }

  return null;
}
