import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== Role.ADMIN) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    where: {
      OR: [
        { email: { contains: "zarina", mode: "insensitive" } },
        { name: { contains: "Акматова", mode: "insensitive" } },
        { name: { contains: "Зарина", mode: "insensitive" } }
      ]
    },
    select: { id: true, name: true, email: true, role: true, department: { select: { name: true, shortName: true } } }
  });

  const uchrDepartments = await prisma.department.findMany({
    where: {
      OR: [
        { name: { equals: "УЧР", mode: "insensitive" } },
        { name: { contains: "Управление человеческими ресурсами", mode: "insensitive" } },
        { shortName: { equals: "УЧР", mode: "insensitive" } },
        { shortName: { contains: "Управление человеческими ресурсами", mode: "insensitive" } }
      ]
    },
    select: { id: true, name: true, shortName: true }
  });

  const userIds = users.map((item) => item.id);
  const departmentIds = uchrDepartments.map((item) => item.id);
  const evaluations = await prisma.evaluation.findMany({
    where: {
      OR: [
        { authorId: { in: userIds } },
        { evaluatorUserId: { in: userIds } },
        { evaluatorDepartmentId: { in: departmentIds } }
      ]
    },
    include: {
      period: true,
      criterion: true,
      evaluatorDepartment: true,
      evaluateeDepartment: true,
      author: true,
      evaluatorUser: true
    },
    orderBy: [{ updatedAt: "desc" }],
    take: 500
  });

  const grouped = evaluations.reduce<Record<string, number>>((acc, evaluation) => {
    const key = `${evaluation.period.month}.${evaluation.period.year} / ${evaluation.criterion.name} / ${
      evaluation.author.name
    }`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const auditLogs = await prisma.auditLog.findMany({
    where: {
      OR: [
        { userId: { in: userIds } },
        { userName: { contains: "Акматова", mode: "insensitive" } },
        { userName: { contains: "Зарина", mode: "insensitive" } },
        { details: { contains: "УЧР", mode: "insensitive" } }
      ]
    },
    orderBy: { createdAt: "desc" },
    take: 100
  });

  return NextResponse.json({
    users,
    uchrDepartments,
    grouped,
    auditLogs,
    total: evaluations.length,
    evaluations: evaluations.map((evaluation) => ({
      id: evaluation.id,
      period: `${evaluation.period.month}.${evaluation.period.year}`,
      periodStatus: evaluation.period.status,
      criterion: evaluation.criterion.name,
      evaluator: evaluation.evaluatorDepartment?.name || evaluation.evaluatorUser?.name || "",
      evaluatee: evaluation.evaluateeDepartment.name,
      score: evaluation.score,
      noInteraction: evaluation.noInteraction,
      comment: evaluation.comment,
      author: evaluation.author.name,
      authorEmail: evaluation.author.email,
      updatedAt: evaluation.updatedAt
    }))
  });
}
