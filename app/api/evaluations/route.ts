import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { isValidDeviationCategory } from "@/lib/evaluation-categories";
import { isEvaluatableDepartmentName } from "@/lib/evaluation-scope";
import { prisma } from "@/lib/prisma";

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
  const comment = String(body?.comment || "").trim();
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

  if (!noInteraction && (!Number.isInteger(score) || score < 1 || score > 10)) {
    return NextResponse.json({ error: "Оценка должна быть целым числом от 1 до 10" }, { status: 400 });
  }

  if (!isDirectorEvaluation && effectiveEvaluatorDepartmentId === evaluateeDepartmentId) {
    return NextResponse.json({ error: "Подразделение не оценивает само себя" }, { status: 400 });
  }

  if (!noInteraction && score < 10 && !comment) {
    return NextResponse.json({ error: "Для оценки ниже 10 комментарий обязателен" }, { status: 400 });
  }

  if (!noInteraction && score < 10 && normalizedDeviationCategories.length === 0) {
    return NextResponse.json({ error: "Для оценки ниже 10 выберите категорию отклонения" }, { status: 400 });
  }

  if (!noInteraction && normalizedDeviationCategories.some((category) => !isValidDeviationCategory(category))) {
    return NextResponse.json({ error: "Выбрана некорректная категория отклонения" }, { status: 400 });
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

  const existing = await prisma.evaluation.findFirst({
    where: isDirectorEvaluation
      ? {
          periodId,
          evaluatorUserId: user.id,
          evaluateeDepartmentId,
          criterionId
        }
      : {
          periodId,
          evaluatorDepartmentId: effectiveEvaluatorDepartmentId,
          evaluateeDepartmentId,
          criterionId
        }
  });

  const evaluation = existing
    ? await prisma.evaluation.update({ where: { id: existing.id }, data: payload })
    : await prisma.evaluation.create({ data: payload });

  await writeAuditLog({
    action: existing ? "evaluation.update" : "evaluation.create",
    summary: existing ? "Оценка изменена" : "Оценка создана",
    details: `Оцениваемый отдел: ${evaluateeDepartment.name}. Оценка: ${
      noInteraction ? "Нет взаимодействия" : scoreToSave
    }.`,
    user,
    request
  });

  return NextResponse.json({ evaluation });
}
