import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import {
  DEFAULT_FULL_COVERAGE_EVALUATEE_NAMES,
  DEFAULT_REQUIRED_EVALUATOR_NAMES,
  isEvaluatableDepartment,
  normalizeDepartmentName
} from "@/lib/evaluation-scope";
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
  const evaluateeDepartments = departments.filter(isEvaluatableDepartment);
  const departmentsByName = new Map(departments.map((department) => [normalizeDepartmentName(department.name), department]));
  const evaluatorDepartments = DEFAULT_REQUIRED_EVALUATOR_NAMES.map((name) =>
    departmentsByName.get(normalizeDepartmentName(name))
  ).filter((department): department is { id: string; name: string } => Boolean(department));
  const fullCoverageEvaluatees = DEFAULT_FULL_COVERAGE_EVALUATEE_NAMES.map((name) =>
    departmentsByName.get(normalizeDepartmentName(name))
  ).filter((department): department is { id: string; name: string } => Boolean(department));

  let updatedCount = 0;

  for (const evaluateeDepartment of evaluateeDepartments) {
    for (const evaluatorDepartment of evaluatorDepartments) {
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

  for (const evaluateeDepartment of fullCoverageEvaluatees) {
    if (!isEvaluatableDepartment(evaluateeDepartment)) continue;
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

  return NextResponse.json({
    message: `Стандарт обязательных оценок применен. Активировано связок: ${updatedCount}.`
  });
}
