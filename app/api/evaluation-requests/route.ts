import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { isEvaluatableDepartmentName } from "@/lib/evaluation-scope";
import { prisma } from "@/lib/prisma";
import { launchEvaluationRequest, notifyAdminsEvaluationStarted } from "@/lib/evaluation-requests";

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
  const evaluateeDepartmentId = String(body?.evaluateeDepartmentId || "");
  const scheduledAt = parseDate(body?.scheduledAt);

  if (!periodId || !evaluateeDepartmentId) {
    return NextResponse.json({ error: "Укажите период и подразделение" }, { status: 400 });
  }
  if (scheduledAt === null) {
    return NextResponse.json({ error: "Некорректная дата запуска" }, { status: 400 });
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

  const result = await launchEvaluationRequest({
    periodId,
    evaluateeDepartmentId,
    initiatedById: user.id,
    scheduledAt: scheduledAt || undefined
  });

  const adminNotice = await notifyAdminsEvaluationStarted({
    periodId,
    initiatedById: user.id,
    summary: `Запущена оценка отдела ${evaluateeDepartment.name}. Обязательных оценщиков: ${result.requirementsCount}.`
  });

  const message = result.scheduled
    ? `Оценка запланирована. Обязательных оценщиков: ${result.requirementsCount}.`
    : result.mailSkipped
      ? `Оценка создана, но письмо не отправлено: не настроен SMTP или нет получателей. Обязательных оценщиков: ${result.requirementsCount}.`
      : `Оценка запущена. Письмо отправлено руководителям: ${result.recipientsCount}. Обязательных оценщиков: ${result.requirementsCount}.`;

  return NextResponse.json({
    message: `${message} Админу отправлено уведомлений: ${adminNotice.adminRecipients}.`
  });
}
