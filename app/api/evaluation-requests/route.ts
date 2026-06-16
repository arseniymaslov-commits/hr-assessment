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
  if (!user || (user.role !== Role.ADMIN && user.role !== Role.LEADER)) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const periodId = String(body?.periodId || "");
  const evaluateeDepartmentId = String(body?.evaluateeDepartmentId || "");
  const scheduledAt = parseDate(body?.scheduledAt);
  const deadlineAt = parseDate(body?.deadlineAt);

  if (!periodId || !evaluateeDepartmentId) {
    return NextResponse.json({ error: "Укажите период и подразделение" }, { status: 400 });
  }
  if (scheduledAt === null || deadlineAt === null) {
    return NextResponse.json({ error: "Некорректная дата запуска или дедлайн" }, { status: 400 });
  }
  if (scheduledAt && deadlineAt && deadlineAt <= scheduledAt) {
    return NextResponse.json({ error: "Дедлайн должен быть позже даты запуска" }, { status: 400 });
  }

  if (user.role === Role.LEADER && user.departmentId !== evaluateeDepartmentId) {
    return NextResponse.json(
      { error: "Руководитель или заместитель может запускать оценку только своего отдела" },
      { status: 403 }
    );
  }

  const period = await prisma.period.findUnique({ where: { id: periodId } });
  if (!period || period.status !== "OPEN") {
    return NextResponse.json({ error: "Период закрыт или не найден" }, { status: 400 });
  }

  const result = await launchEvaluationRequest({
    periodId,
    evaluateeDepartmentId,
    initiatedById: user.id,
    scheduledAt: scheduledAt || undefined,
    deadlineAt: deadlineAt || undefined
  });

  return NextResponse.json({
    message: result.scheduled
      ? `Оценка запланирована. Обязательных оценщиков: ${result.requirementsCount}.`
      : `Оценка запущена. Уведомлений: ${result.recipientsCount}. Обязательных оценщиков: ${result.requirementsCount}.`
  });
}
