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

function parseAuditEvaluation(details: string | null) {
  const parts = String(details || "").split(": ");
  if (parts.length < 3) return null;

  const evaluateeLabel = parts[1]?.split(".")[0]?.trim();
  const scoreLabel = parts[2]?.split(".")[0]?.trim();
  if (!evaluateeLabel || !scoreLabel) return null;

  return { evaluateeLabel, scoreLabel };
}

function isAutomaticComment(comment: string | null) {
  return Boolean(comment?.includes("Автоматически отмечено"));
}

export async function POST() {
  const user = await getCurrentUser();
  if (user?.role !== Role.ADMIN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [period, criterion, nurzat, ovaDepartment, departments] = await Promise.all([
    prisma.period.findFirst({ where: { status: "OPEN" }, orderBy: [{ year: "desc" }, { month: "desc" }] }),
    prisma.criterion.findFirst({ where: { name: "Общая оценка взаимодействия" } }),
    prisma.user.findFirst({
      where: {
        OR: [
          { name: { contains: "Нурзат", mode: "insensitive" } },
          { name: { contains: "Шаим", mode: "insensitive" } },
          { email: { contains: "nurz", mode: "insensitive" } },
          { email: { contains: "shaim", mode: "insensitive" } }
        ]
      }
    }),
    prisma.department.findFirst({
      where: {
        OR: [
          { name: "ОВА" },
          { shortName: "ОВА" },
          { shortName: { contains: "внутреннего аудита", mode: "insensitive" } }
        ]
      }
    }),
    prisma.department.findMany()
  ]);

  if (!period || !criterion || !nurzat || !ovaDepartment) {
    return NextResponse.json({ error: "Required data not found" }, { status: 404 });
  }

  const logs = await prisma.auditLog.findMany({
    where: {
      userName: nurzat.name,
      action: { in: ["evaluation.create", "evaluation.update"] }
    },
    orderBy: { createdAt: "desc" },
    take: 300
  });

  const latestByEvaluatee = new Map<string, { score: number | null; noInteraction: boolean }>();
  for (const log of logs) {
    const parsed = parseAuditEvaluation(log.details);
    if (!parsed || latestByEvaluatee.has(parsed.evaluateeLabel)) continue;

    const noInteraction = parsed.scoreLabel.toLowerCase().includes("нет");
    latestByEvaluatee.set(parsed.evaluateeLabel, {
      score: noInteraction ? null : Number(parsed.scoreLabel),
      noInteraction
    });
  }

  const updated: Array<{ evaluatee: string; score: number | null; noInteraction: boolean; preservedComment: boolean }> = [];
  const skipped: string[] = [];

  for (const [evaluateeLabel, value] of latestByEvaluatee) {
    const evaluateeDepartment = departments.find(
      (department) => department.name === evaluateeLabel || department.shortName === evaluateeLabel
    );
    if (!evaluateeDepartment || evaluateeDepartment.id === ovaDepartment.id) {
      skipped.push(evaluateeLabel);
      continue;
    }

    const existing = await prisma.evaluation.findFirst({
      where: {
        periodId: period.id,
        evaluatorDepartmentId: ovaDepartment.id,
        evaluateeDepartmentId: evaluateeDepartment.id,
        criterionId: criterion.id
      }
    });

    const preservedComment = existing?.comment && !isAutomaticComment(existing.comment) ? existing.comment : null;
    const comment = value.noInteraction ? "Нет взаимодействия за период" : preservedComment;

    if (existing) {
      await prisma.evaluation.update({
        where: { id: existing.id },
        data: {
          score: value.score,
          noInteraction: value.noInteraction,
          deviationCategories: [],
          comment,
          authorId: nurzat.id
        }
      });
    } else {
      await prisma.evaluation.create({
        data: {
          periodId: period.id,
          evaluatorDepartmentId: ovaDepartment.id,
          evaluateeDepartmentId: evaluateeDepartment.id,
          criterionId: criterion.id,
          score: value.score,
          noInteraction: value.noInteraction,
          deviationCategories: [],
          comment,
          authorId: nurzat.id
        }
      });
    }

    updated.push({
      evaluatee: evaluateeDepartment.name,
      score: value.score,
      noInteraction: value.noInteraction,
      preservedComment: Boolean(preservedComment)
    });
  }

  await prisma.auditLog.create({
    data: {
      action: "maintenance.restoreOvaScores",
      summary: "OVA scores restored from audit log",
      details: `Updated: ${updated.length}. Skipped: ${skipped.join(", ") || "none"}.`,
      userId: user.id,
      userName: user.name
    }
  });

  return NextResponse.json({ updated, skipped });
}
