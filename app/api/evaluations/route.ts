import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
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
  const isDirectorEvaluation = user.role === Role.DIRECTOR;

  if (!periodId || !evaluateeDepartmentId || !criterionId || (!isDirectorEvaluation && !evaluatorDepartmentId)) {
    return NextResponse.json({ error: "Заполните все обязательные поля" }, { status: 400 });
  }

  if (!noInteraction && (!Number.isInteger(score) || score < 1 || score > 10)) {
    return NextResponse.json({ error: "Оценка должна быть целым числом от 1 до 10" }, { status: 400 });
  }

  if (!isDirectorEvaluation && evaluatorDepartmentId === evaluateeDepartmentId) {
    return NextResponse.json({ error: "Подразделение не оценивает само себя" }, { status: 400 });
  }

  if (!noInteraction && score < 9 && !comment) {
    return NextResponse.json({ error: "Для оценки ниже 9 комментарий обязателен" }, { status: 400 });
  }

  if (user.role === Role.LEADER && user.departmentId !== evaluatorDepartmentId) {
    return NextResponse.json(
      { error: "Руководитель или заместитель может заполнять только оценки своего подразделения" },
      { status: 403 }
    );
  }

  const period = await prisma.period.findUnique({ where: { id: periodId } });
  if (!period || period.status !== "OPEN") {
    return NextResponse.json({ error: "Период закрыт или не найден" }, { status: 400 });
  }

  const payload = {
    periodId,
    evaluatorDepartmentId: isDirectorEvaluation ? null : evaluatorDepartmentId,
    evaluatorUserId: isDirectorEvaluation ? user.id : null,
    evaluateeDepartmentId,
    criterionId,
    score: scoreToSave,
    noInteraction,
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
          evaluatorDepartmentId,
          evaluateeDepartmentId,
          criterionId
        }
  });

  const evaluation = existing
    ? await prisma.evaluation.update({ where: { id: existing.id }, data: payload })
    : await prisma.evaluation.create({ data: payload });

  return NextResponse.json({ evaluation });
}
