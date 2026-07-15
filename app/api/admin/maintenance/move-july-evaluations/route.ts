import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

const CUTOFF = new Date("2026-07-01T00:00:00.000Z");

type Candidate = Awaited<ReturnType<typeof findCandidates>>[number];

async function findCandidates() {
  const [openPeriod, previousPeriod] = await Promise.all([
    prisma.period.findFirst({ where: { status: "OPEN" }, orderBy: [{ year: "desc" }, { month: "desc" }] }),
    prisma.period.findUnique({ where: { month_year: { month: 6, year: 2026 } } })
  ]);

  if (!openPeriod || !previousPeriod) {
    return [];
  }

  return prisma.evaluation.findMany({
    where: {
      periodId: previousPeriod.id,
      createdAt: { gte: CUTOFF }
    },
    include: {
      evaluatorDepartment: true,
      evaluatorUser: true,
      evaluateeDepartment: true,
      criterion: true,
      author: true,
      period: true
    },
    orderBy: { createdAt: "asc" }
  });
}

async function targetFor(candidate: Candidate, openPeriodId: string) {
  if (candidate.evaluatorDepartmentId) {
    return prisma.evaluation.findFirst({
      where: {
        periodId: openPeriodId,
        evaluatorDepartmentId: candidate.evaluatorDepartmentId,
        evaluateeDepartmentId: candidate.evaluateeDepartmentId,
        criterionId: candidate.criterionId
      }
    });
  }

  return prisma.evaluation.findFirst({
    where: {
      periodId: openPeriodId,
      evaluatorUserId: candidate.evaluatorUserId,
      evaluateeDepartmentId: candidate.evaluateeDepartmentId,
      criterionId: candidate.criterionId
    }
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (user?.role !== Role.ADMIN) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const apply = body?.apply === true;

  const [openPeriod, previousPeriod] = await Promise.all([
    prisma.period.findFirst({ where: { status: "OPEN" }, orderBy: [{ year: "desc" }, { month: "desc" }] }),
    prisma.period.findUnique({ where: { month_year: { month: 6, year: 2026 } } })
  ]);

  if (!openPeriod || !previousPeriod) {
    return NextResponse.json({ error: "Не найден открытый или июньский период" }, { status: 400 });
  }

  const candidates = await findCandidates();

  if (!apply) {
    return NextResponse.json({
      mode: "dryRun",
      fromPeriod: `${String(previousPeriod.month).padStart(2, "0")}.${previousPeriod.year}`,
      toPeriod: `${String(openPeriod.month).padStart(2, "0")}.${openPeriod.year}`,
      cutoff: CUTOFF.toISOString(),
      count: candidates.length,
      examples: candidates.slice(0, 10).map((item) => ({
        id: item.id,
        createdAt: item.createdAt,
        evaluator: item.evaluatorDepartment?.name || item.evaluatorUser?.name || "Директор",
        evaluatee: item.evaluateeDepartment.name,
        score: item.noInteraction ? "Нет взаимодействия" : item.score,
        author: item.author.name
      }))
    });
  }

  let moved = 0;
  let merged = 0;
  let skipped = 0;

  for (const candidate of candidates) {
    const existingTarget = await targetFor(candidate, openPeriod.id);

    if (!existingTarget) {
      await prisma.evaluation.update({
        where: { id: candidate.id },
        data: { periodId: openPeriod.id }
      });
      moved += 1;
      continue;
    }

    if (candidate.updatedAt > existingTarget.updatedAt) {
      await prisma.evaluation.update({
        where: { id: existingTarget.id },
        data: {
          score: candidate.score,
          noInteraction: candidate.noInteraction,
          deviationCategories: candidate.deviationCategories,
          comment: candidate.comment,
          authorId: candidate.authorId,
          evaluatorUserId: candidate.evaluatorUserId
        }
      });
      merged += 1;
    } else {
      skipped += 1;
    }

    await prisma.evaluation.delete({ where: { id: candidate.id } });
  }

  await writeAuditLog({
    action: "maintenance.move-evaluations",
    summary: "Перенесены оценки в открытый период",
    details: `Из периода 06.2026 в ${String(openPeriod.month).padStart(2, "0")}.${openPeriod.year}. Перенесено: ${moved}, объединено: ${merged}, оставлено более свежее: ${skipped}.`,
    user
  });

  return NextResponse.json({
    mode: "apply",
    fromPeriod: "06.2026",
    toPeriod: `${String(openPeriod.month).padStart(2, "0")}.${openPeriod.year}`,
    cutoff: CUTOFF.toISOString(),
    moved,
    merged,
    skipped,
    total: candidates.length
  });
}
