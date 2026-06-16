import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { launchEvaluationRequest } from "@/lib/evaluation-requests";

function parseDate(value: unknown) {
  if (!value) return undefined;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== Role.ADMIN) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const periodId = String(body?.periodId || "");
  const scheduledAt = parseDate(body?.scheduledAt);
  const deadlineAt = parseDate(body?.deadlineAt);

  if (!periodId) {
    return NextResponse.json({ error: "Укажите период оценки" }, { status: 400 });
  }
  if (scheduledAt === null || deadlineAt === null) {
    return NextResponse.json({ error: "Некорректная дата запуска или дедлайн" }, { status: 400 });
  }
  if (scheduledAt && deadlineAt && deadlineAt <= scheduledAt) {
    return NextResponse.json({ error: "Дедлайн должен быть позже даты запуска" }, { status: 400 });
  }

  const period = await prisma.period.findUnique({ where: { id: periodId } });
  if (!period || period.status !== "OPEN") {
    return NextResponse.json({ error: "Период закрыт или не найден" }, { status: 400 });
  }

  const departments = await prisma.department.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" }
  });

  let notifications = 0;
  let requirements = 0;
  let scheduled = 0;
  for (const department of departments) {
    const result = await launchEvaluationRequest({
      periodId,
      evaluateeDepartmentId: department.id,
      initiatedById: user.id,
      scheduledAt: scheduledAt || undefined,
      deadlineAt: deadlineAt || undefined
    });
    notifications += result.recipientsCount;
    requirements += result.requirementsCount;
    if (result.scheduled) scheduled += 1;
  }

  return NextResponse.json({
    message: scheduled
      ? `Оценка запланирована для всех СП: ${departments.length}. Обязательных оценщиков: ${requirements}.`
      : `Оценка запущена для всех СП: ${departments.length}. Уведомлений: ${notifications}. Обязательных оценщиков: ${requirements}.`
  });
}
