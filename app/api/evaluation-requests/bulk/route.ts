import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { isEvaluatableDepartment } from "@/lib/evaluation-scope";
import { prisma } from "@/lib/prisma";
import { launchEvaluationRequest, notifyAdminsEvaluationStarted, notifyEvaluationRequests } from "@/lib/evaluation-requests";

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

  if (!periodId) {
    return NextResponse.json({ error: "Укажите период оценки" }, { status: 400 });
  }
  if (scheduledAt === null) {
    return NextResponse.json({ error: "Некорректная дата запуска" }, { status: 400 });
  }

  const period = await prisma.period.findUnique({ where: { id: periodId } });
  if (!period || period.status !== "OPEN") {
    return NextResponse.json({ error: "Период закрыт или не найден" }, { status: 400 });
  }

  const departments = (await prisma.department.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" }
  })).filter(isEvaluatableDepartment);

  let notifications = 0;
  let requirements = 0;
  let scheduled = 0;
  let skippedNotifications = 0;
  const requestIds: string[] = [];
  const notifyImmediately = !scheduledAt || scheduledAt <= new Date();
  for (const department of departments) {
    const result = await launchEvaluationRequest({
      periodId,
      evaluateeDepartmentId: department.id,
      initiatedById: user.id,
      scheduledAt: scheduledAt || undefined,
      notifyNow: false
    });
    requestIds.push(result.request.id);
    notifications += result.recipientsCount;
    requirements += result.requirementsCount;
    if (result.scheduled) scheduled += 1;
    if (result.mailSkipped) skippedNotifications += 1;
  }

  if (notifyImmediately) {
    const notification = await notifyEvaluationRequests(requestIds);
    notifications += notification.recipientsCount;
    if (notification.mailSkipped) skippedNotifications += requestIds.length;
  }

  const summary = `Запущена оценка для всех СП: ${departments.length}. Обязательных связок: ${requirements}.`;
  const adminNotice = await notifyAdminsEvaluationStarted({
    periodId,
    initiatedById: user.id,
    summary
  });

  return NextResponse.json({
    message: (scheduled
      ? `Оценка запланирована для всех СП: ${departments.length}. Обязательных оценщиков: ${requirements}.`
      : skippedNotifications
        ? `Оценка создана для всех СП: ${departments.length}, но часть писем не отправлена из-за настроек SMTP или отсутствия получателей. Обязательных оценщиков: ${requirements}.`
      : `Оценка запущена для всех СП: ${departments.length}. Уведомлений: ${notifications}. Обязательных оценщиков: ${requirements}.`) +
      ` Админу отправлено уведомлений: ${adminNotice.adminRecipients}.`
  });
}
