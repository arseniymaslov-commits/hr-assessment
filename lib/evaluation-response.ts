import { Role } from "@prisma/client";
import { isMissingEvaluation } from "@/lib/evaluation-status";

export const MAX_RESPONSE_LENGTH = 300;

export type EvaluationResponseView = {
  text: string;
  authorName: string;
  updatedAt: string;
};

export type ResponseUser = { id: string; role: Role; isActive: boolean; name: string };
type RespondableEvaluation = {
  evaluateeDepartmentId: string;
  score: number | null;
  noInteraction: boolean;
  comment: string | null;
};

export function canRespondToEvaluation(user: ResponseUser, evaluation: RespondableEvaluation, departmentIds: string[]) {
  return user.isActive && !evaluation.noInteraction && !isMissingEvaluation(evaluation) &&
    evaluation.score != null && evaluation.score <= 9 && evaluation.score >= 1 &&
    (user.role === Role.ADMIN ||
      ((user.role === Role.LEADER || user.role === Role.DIRECTOR) && departmentIds.includes(evaluation.evaluateeDepartmentId)));
}

export function serializeEvaluationResponse(response: {
  text: string; updatedAt: Date; author: { name: string } | null;
} | null | undefined): EvaluationResponseView | null {
  return response ? { text: response.text, authorName: response.author?.name || "Автор удалён", updatedAt: response.updatedAt.toISOString() } : null;
}
