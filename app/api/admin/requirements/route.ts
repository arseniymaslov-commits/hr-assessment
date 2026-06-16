import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
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
