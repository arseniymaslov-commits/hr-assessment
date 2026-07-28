import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { isEvaluatableDepartmentName } from "@/lib/evaluation-scope";
import { isAutomaticMissingComment } from "@/lib/evaluation-status";
import { validateEvaluationInput } from "@/lib/evaluation-validation";
import { prisma } from "@/lib/prisma";

function formatAuditDateTime(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Bishkek",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function revalidateEvaluationViews() {
  ["/admin", "/analytics", "/completion", "/dashboard", "/evaluations", "/matrix"].forEach((path) =>
    revalidatePath(path)
  );
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || (user.role !== Role.ADMIN && user.role !== Role.LEADER && user.role !== Role.DIRECTOR)) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);

  const periodId = String(body?.periodId || "");
  const evaluatorDepartmentId = String(body?.evaluatorDepartmentId || "");
  const evaluateeDepartmentId = String(body?.evaluateeDepartmentId || "");
  const criterionId = String(body?.criterionId || "");
  const noInteraction = Boolean(body?.noInteraction);
  const score = Number(body?.score);
  const scoreToSave = noInteraction ? null : score;
  const rawComment = String(body?.comment || "").trim();
  const comment = !noInteraction && isAutomaticMissingComment(rawComment) ? "" : rawComment;
  const deviationCategories: string[] = Array.isArray(body?.deviationCategories)
    ? body.deviationCategories.map(String).map((item: string) => item.trim()).filter(Boolean)
    : [];
  const normalizedDeviationCategories: string[] = Array.from(new Set(deviationCategories));
  const isDirectorEvaluation = user.role === Role.DIRECTOR;
  const effectiveEvaluatorDepartmentId =
    user.role === Role.LEADER ? user.departmentId || "" : evaluatorDepartmentId;

  if (!periodId || !evaluateeDepartmentId || !criterionId || (!isDirectorEvaluation && !effectiveEvaluatorDepartmentId)) {
    return NextResponse.json({ error: "Заполните все обязательные поля" }, { status: 400 });
  }

  const validationError = validateEvaluationInput({
    noInteraction,
    score,
    comment,
    deviationCategories: normalizedDeviationCategories
  });
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  if (!isDirectorEvaluation && effectiveEvaluatorDepartmentId === evaluateeDepartmentId) {
    return NextResponse.json({ error: "Подразделение не оценивает само себя" }, { status: 400 });
  }

  if (user.role === Role.LEADER && !user.departmentId) {
    return NextResponse.json(
      { error: "У пользователя не указан отдел для оценки" },
      { status: 403 }
    );
  }

  const period = await prisma.period.findUnique({ where: { id: periodId } });
  if (!period || period.status !== "OPEN") {
    return NextResponse.json({ error: "Период закрыт или не найден" }, { status: 400 });
  }

  const evaluateeDepartment = await prisma.department.findUnique({
    where: { id: evaluateeDepartmentId },
    select: { name: true, isActive: true }
  });
  if (!evaluateeDepartment?.isActive || !isEvaluatableDepartmentName(evaluateeDepartment.name)) {
    return NextResponse.json({ error: "Это подразделение исключено из списка оцениваемых" }, { status: 400 });
  }

  const payload = {
    periodId,
    evaluatorDepartmentId: isDirectorEvaluation ? null : effectiveEvaluatorDepartmentId,
    evaluatorUserId: isDirectorEvaluation ? user.id : null,
    evaluateeDepartmentId,
    criterionId,
    score: scoreToSave,
    noInteraction,
    deviationCategories: noInteraction || score === 10 ? [] : normalizedDeviationCategories,
    comment: comment || (noInteraction ? "Нет взаимодействия за период" : null),
    authorId: user.id
  };

  const existingRows = await prisma.evaluation.findMany({
    where: isDirectorEvaluation
      ? {
          periodId,
          evaluatorUserId: user.id,
          evaluateeDepartmentId
        }
      : {
          periodId,
          evaluatorDepartmentId: effectiveEvaluatorDepartmentId,
          evaluateeDepartmentId
        },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    select: { id: true, criterionId: true }
  });
  const existing = existingRows.find((row) => row.criterionId === criterionId) || existingRows[0] || null;

  const evaluation = isDirectorEvaluation
    ? existing
      ? await prisma.evaluation.update({ where: { id: existing.id }, data: payload })
      : await prisma.evaluation.create({ data: payload })
    : existing
      ? await prisma.evaluation.update({ where: { id: existing.id }, data: payload })
      : await prisma.evaluation.create({ data: payload });

  const duplicateIds = existingRows.slice(1).map((row) => row.id);
  if (isDirectorEvaluation && duplicateIds.length) {
    await prisma.evaluation.deleteMany({ where: { id: { in: duplicateIds } } });
  }

  await writeAuditLog({
    action: existing ? "evaluation.update" : "evaluation.create",
    summary: existing ? "Оценка изменена" : "Оценка создана",
    details: `Оцениваемый отдел: ${evaluateeDepartment.name}. Оценка: ${
      noInteraction ? "Нет взаимодействия" : scoreToSave
    }. Время оценки: ${formatAuditDateTime(evaluation.updatedAt)}.`,
    user,
    request
  });

  revalidateEvaluationViews();

  return NextResponse.json({ evaluation });
}
