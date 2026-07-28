import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { isMandatoryEvaluateeDepartment } from "@/lib/evaluation-scope";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const user = await getCurrentUser();
  if (user?.role !== Role.ADMIN) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const departments = await prisma.department.findMany({
    where: { isActive: true },
    select: { id: true, name: true }
  });
  const evaluateeDepartments = departments.filter(isMandatoryEvaluateeDepartment);

  let updatedCount = 0;

  for (const evaluateeDepartment of evaluateeDepartments) {
    for (const evaluatorDepartment of departments) {
      if (evaluatorDepartment.id === evaluateeDepartment.id) continue;
      await prisma.evaluationRequirement.upsert({
        where: {
          evaluatorDepartmentId_evaluateeDepartmentId: {
            evaluatorDepartmentId: evaluatorDepartment.id,
            evaluateeDepartmentId: evaluateeDepartment.id
          }
        },
        update: { isActive: true },
        create: {
          evaluatorDepartmentId: evaluatorDepartment.id,
          evaluateeDepartmentId: evaluateeDepartment.id,
          isActive: true
        }
      });
      updatedCount += 1;
    }
  }

  await writeAuditLog({
    action: "requirements.defaults",
    summary: "Применен стандарт: обязательная оценка только для ОЦП, УЧР и ПЭО",
    details: `Активировано связок: ${updatedCount}`,
    user
  });

  return NextResponse.json({
    message: `Стандарт обязательных оценок применен для ОЦП, УЧР и ПЭО. Активировано связок: ${updatedCount}.`
  });
}
