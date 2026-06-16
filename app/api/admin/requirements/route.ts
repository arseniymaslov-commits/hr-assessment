import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { isEvaluatableDepartmentName } from "@/lib/evaluation-scope";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (user?.role !== Role.ADMIN) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const evaluatorDepartmentId = String(body?.evaluatorDepartmentId || "");
  const evaluateeDepartmentId = String(body?.evaluateeDepartmentId || "");
  const isActive = Boolean(body?.isActive);

  if (!evaluatorDepartmentId || !evaluateeDepartmentId) {
    return NextResponse.json({ error: "Укажите пару подразделений" }, { status: 400 });
  }

  if (evaluatorDepartmentId === evaluateeDepartmentId) {
    return NextResponse.json({ error: "Подразделение не оценивает само себя" }, { status: 400 });
  }

  const [evaluatorDepartment, evaluateeDepartment] = await Promise.all([
    prisma.department.findUnique({ where: { id: evaluatorDepartmentId }, select: { isActive: true } }),
    prisma.department.findUnique({ where: { id: evaluateeDepartmentId }, select: { name: true, isActive: true } })
  ]);
  if (!evaluatorDepartment?.isActive || !evaluateeDepartment?.isActive) {
    return NextResponse.json({ error: "Одно из подразделений не найдено или отключено" }, { status: 400 });
  }
  if (!isEvaluatableDepartmentName(evaluateeDepartment.name)) {
    return NextResponse.json({ error: "Это подразделение исключено из списка оцениваемых" }, { status: 400 });
  }

  await prisma.evaluationRequirement.upsert({
    where: {
      evaluatorDepartmentId_evaluateeDepartmentId: {
        evaluatorDepartmentId,
        evaluateeDepartmentId
      }
    },
    update: { isActive },
    create: {
      evaluatorDepartmentId,
      evaluateeDepartmentId,
      isActive
    }
  });

  return NextResponse.json({ message: "Обязательная оценка обновлена" });
}
