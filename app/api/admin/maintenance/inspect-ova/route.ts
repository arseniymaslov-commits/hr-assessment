import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getCurrentUser();
  if (user?.role !== Role.ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [period, criterion] = await Promise.all([
    prisma.period.findFirst({ where: { status: "OPEN" }, orderBy: [{ year: "desc" }, { month: "desc" }] }),
    prisma.criterion.findFirst({ where: { name: "Общая оценка взаимодействия" } })
  ]);

  const [users, departments] = await Promise.all([
    prisma.user.findMany({
      where: {
        OR: [
          { name: { contains: "Нурзат", mode: "insensitive" } },
          { name: { contains: "Шаим", mode: "insensitive" } },
          { email: { contains: "nurz", mode: "insensitive" } },
          { email: { contains: "shaim", mode: "insensitive" } }
        ]
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        departmentId: true,
        department: { select: { id: true, name: true, shortName: true } }
      }
    }),
    prisma.department.findMany({
      where: {
        OR: [
          { name: { contains: "ОВА", mode: "insensitive" } },
          { shortName: { contains: "ОВА", mode: "insensitive" } },
          { name: { contains: "аудит", mode: "insensitive" } },
          { shortName: { contains: "аудит", mode: "insensitive" } }
        ]
      },
      select: { id: true, name: true, shortName: true, isActive: true }
    })
  ]);

  const userIds = users.map((item) => item.id);
  const departmentIds = departments.map((item) => item.id);

  const [evaluations, auditLogs] = await Promise.all([
    prisma.evaluation.findMany({
      where: {
        periodId: period?.id,
        criterionId: criterion?.id,
        OR: [{ authorId: { in: userIds } }, { evaluatorDepartmentId: { in: departmentIds } }]
      },
      include: {
        evaluatorDepartment: true,
        evaluateeDepartment: true,
        author: { select: { id: true, name: true, email: true } }
      },
      orderBy: { updatedAt: "desc" }
    }),
    prisma.auditLog.findMany({
      where: {
        OR: [
          { userName: { contains: "Нурзат", mode: "insensitive" } },
          { userName: { contains: "Шаим", mode: "insensitive" } },
          { summary: { contains: "Нурзат", mode: "insensitive" } },
          { details: { contains: "Нурзат", mode: "insensitive" } },
          { details: { contains: "Шаим", mode: "insensitive" } },
          { details: { contains: "ОВА", mode: "insensitive" } },
          { details: { contains: "внутреннего аудита", mode: "insensitive" } }
        ]
      },
      orderBy: { createdAt: "desc" },
      take: 200
    })
  ]);

  return NextResponse.json({
    period,
    criterion,
    users,
    departments,
    evaluations: evaluations.map((item) => ({
      id: item.id,
      evaluator: item.evaluatorDepartment?.name,
      evaluatorShortName: item.evaluatorDepartment?.shortName,
      evaluatee: item.evaluateeDepartment.name,
      evaluateeShortName: item.evaluateeDepartment.shortName,
      score: item.score,
      noInteraction: item.noInteraction,
      deviationCategories: item.deviationCategories,
      comment: item.comment,
      author: item.author.name,
      authorEmail: item.author.email,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    })),
    auditLogs: auditLogs.map((item) => ({
      id: item.id,
      action: item.action,
      userName: item.userName,
      summary: item.summary,
      details: item.details,
      createdAt: item.createdAt
    }))
  });
}
