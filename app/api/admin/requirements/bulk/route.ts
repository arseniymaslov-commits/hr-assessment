import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { isEvaluatableDepartment, isEvaluatableDepartmentName } from "@/lib/evaluation-scope";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (user?.role !== Role.ADMIN) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const evaluateeDepartmentId = String(body?.evaluateeDepartmentId || "");
  const evaluatorDepartmentIds: string[] = Array.isArray(body?.evaluatorDepartmentIds)
    ? body.evaluatorDepartmentIds.map(String).filter(Boolean)
    : [];
  const evaluateeDepartmentIds: string[] = Array.isArray(body?.evaluateeDepartmentIds)
    ? body.evaluateeDepartmentIds.map(String).filter(Boolean)
    : [];
  const isActive = Boolean(body?.isActive);

  if (evaluateeDepartmentId) {
    const departments = await prisma.department.findMany({
      where: { isActive: true },
      select: { id: true, name: true }
    });
    const evaluateeDepartment = departments.find((department) => department.id === evaluateeDepartmentId);
    if (!evaluateeDepartment || !isEvaluatableDepartmentName(evaluateeDepartment.name)) {
      return NextResponse.json({ error: "Оцениваемый отдел не найден или исключен из оценки" }, { status: 400 });
    }

    const activeDepartmentIds = new Set(departments.map((department) => department.id));
    const selectedEvaluatorIds = new Set(
      evaluatorDepartmentIds.filter(
        (departmentId) => activeDepartmentIds.has(departmentId) && departmentId !== evaluateeDepartmentId
      )
    );

    let activeCount = 0;
    for (const evaluatorDepartmentId of activeDepartmentIds) {
      if (evaluatorDepartmentId === evaluateeDepartmentId) continue;
      const shouldBeActive = selectedEvaluatorIds.has(evaluatorDepartmentId);
      await prisma.evaluationRequirement.upsert({
        where: {
          evaluatorDepartmentId_evaluateeDepartmentId: {
            evaluatorDepartmentId,
            evaluateeDepartmentId
          }
        },
        update: { isActive: shouldBeActive },
        create: {
          evaluatorDepartmentId,
          evaluateeDepartmentId,
          isActive: shouldBeActive
        }
      });
      if (shouldBeActive) activeCount += 1;
    }

    return NextResponse.json({ message: `Список обязательных оценщиков сохранен: ${activeCount}` });
  }

  if (!evaluateeDepartmentIds.length) {
    return NextResponse.json({ error: "Выберите хотя бы один отдел для оценки" }, { status: 400 });
  }

  const departments = await prisma.department.findMany({
    where: { isActive: true },
    select: { id: true, name: true }
  });
  const activeDepartmentIds = new Set(departments.map((department) => department.id));
  const evaluateeDepartmentIdsSet = new Set(
    departments.filter(isEvaluatableDepartment).map((department) => department.id)
  );
  const targetIds = evaluateeDepartmentIds.filter((id) => evaluateeDepartmentIdsSet.has(id));

  if (!targetIds.length) {
    return NextResponse.json({ error: "Выбранные отделы не найдены" }, { status: 400 });
  }

  let updatedCount = 0;
  for (const evaluatorDepartmentId of activeDepartmentIds) {
    for (const evaluateeDepartmentId of targetIds) {
      if (evaluatorDepartmentId === evaluateeDepartmentId) continue;

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
      updatedCount += 1;
    }
  }

  return NextResponse.json({
    message: isActive
      ? `Обязательные оценки назначены: ${updatedCount}`
      : `Обязательные оценки сняты: ${updatedCount}`
  });
}
