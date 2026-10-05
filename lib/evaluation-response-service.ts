import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveEvaluateeDepartmentId } from "@/lib/department-matching";
import { canRespondToEvaluation, MAX_RESPONSE_LENGTH, type ResponseUser } from "@/lib/evaluation-response";

type ScopedUser = ResponseUser & { department: { id: string; name: string; shortName: string } | null };

export async function getResponseDepartmentIds(user: ScopedUser) {
  if (user.role !== Role.LEADER && user.role !== Role.DIRECTOR) return [];
  const departments = await prisma.department.findMany({
    where: { isActive: true },
    select: { id: true, name: true, shortName: true, leaderUserId: true, deputyUserId: true,
      directorAssignments: { where: { userId: user.id }, select: { userId: true } } }
  });
  const primaryId = user.department && /бухгалтер/i.test(user.department.name)
    ? resolveEvaluateeDepartmentId(user.department, departments) : user.department?.id;
  return departments.filter((department) => user.role === Role.DIRECTOR
    ? department.directorAssignments.length > 0
    : department.id === primaryId || department.leaderUserId === user.id || department.deputyUserId === user.id
  ).map((department) => department.id);
}

export class ResponseError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function saveEvaluationResponse(user: ScopedUser, evaluationId: string, value: unknown, request: Request) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > MAX_RESPONSE_LENGTH) {
    throw new ResponseError(`Укажите ответ от 1 до ${MAX_RESPONSE_LENGTH} символов.`, 400);
  }
  const text = value.trim().replace(/\s+/g, " ");
  const departmentIds = await getResponseDepartmentIds(user);
  return prisma.$transaction(async (tx) => {
    const evaluation = await tx.evaluation.findUnique({ where: { id: evaluationId }, include: { response: true } });
    if (!evaluation) throw new ResponseError("Оценка не найдена.", 404);
    if (!canRespondToEvaluation(user, evaluation, departmentIds)) {
      throw new ResponseError("Ответ доступен только вашему подразделению для оценки от 1 до 9.", 403);
    }
    const response = await tx.evaluationResponse.upsert({
      where: { evaluationId },
      create: { evaluationId, text, authorId: user.id },
      update: { text, authorId: user.id },
      include: { author: { select: { name: true } } }
    });
    await tx.auditLog.create({ data: {
      action: "evaluation.response", summary: evaluation.response ? "Изменён ответ подразделения на оценку" : "Добавлен ответ подразделения на оценку",
      userId: user.id, userName: user.name,
      details: JSON.stringify({ evaluationId, evaluateeDepartmentId: evaluation.evaluateeDepartmentId,
        previousText: evaluation.response?.text || null, text,
        ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null })
    } });
    return response;
  });
}
