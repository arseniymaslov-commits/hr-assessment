import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { launchEvaluationRequest } from "@/lib/evaluation-requests";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== Role.ADMIN) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const periodId = String(body?.periodId || "");
  if (!periodId) {
    return NextResponse.json({ error: "Укажите период оценки" }, { status: 400 });
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
  for (const department of departments) {
    const result = await launchEvaluationRequest({
      periodId,
      evaluateeDepartmentId: department.id,
      initiatedById: user.id
    });
    notifications += result.recipientsCount;
    requirements += result.requirementsCount;
  }

  return NextResponse.json({
    message: `Оценка запущена для всех СП: ${departments.length}. Уведомлений: ${notifications}. Обязательных оценщиков: ${requirements}.`
  });
}
