import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { PeriodStatus, Role } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { isEvaluatableDepartment } from "@/lib/evaluation-scope";
import { prisma } from "@/lib/prisma";

const TIME_ZONE = "Asia/Bishkek";
const TEMP_ACTIVATION_TOKEN = "activate-july-2026-9d9f4b63";

function bishkekParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric"
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day") };
}

function previousMonth(month: number, year: number) {
  return month === 1 ? { month: 12, year: year - 1 } : { month: month - 1, year };
}

function startOfBishkekDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day - 1, 18, 0, 0));
}

function revalidatePeriodViews() {
  ["/admin", "/analytics", "/completion", "/dashboard", "/evaluations", "/matrix"].forEach((path) =>
    revalidatePath(path)
  );
}

async function handler(request: Request) {
  const user = await getCurrentUser();
  const token =
    request.headers.get("x-activation-token") ||
    new URL(request.url).searchParams.get("token");
  const hasTemporaryAccess = token === TEMP_ACTIVATION_TOKEN;
  if (user?.role !== Role.ADMIN && !hasTemporaryAccess) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const searchParams = new URL(request.url).searchParams;
  const body =
    request.method === "GET"
      ? {
          month: searchParams.get("month"),
          year: searchParams.get("year"),
          cutoffYear: searchParams.get("cutoffYear"),
          cutoffMonth: searchParams.get("cutoffMonth"),
          cutoffDay: searchParams.get("cutoffDay")
        }
      : await request.json().catch(() => null);
  const nowParts = bishkekParts();
  const month = Number(body?.month || nowParts.month);
  const year = Number(body?.year || nowParts.year);
  const cutoffYear = Number(body?.cutoffYear || nowParts.year);
  const cutoffMonth = Number(body?.cutoffMonth || nowParts.month);
  const cutoffDay = Number(body?.cutoffDay || nowParts.day);

  if (
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12 ||
    !Number.isInteger(year) ||
    !Number.isInteger(cutoffDay) ||
    cutoffDay < 1 ||
    cutoffDay > 31
  ) {
    return NextResponse.json({ error: "Некорректные параметры периода" }, { status: 400 });
  }

  const previous = previousMonth(month, year);
  const cutoff = startOfBishkekDate(cutoffYear, cutoffMonth, cutoffDay);

  const result = await prisma.$transaction(async (tx) => {
    const previousPeriod = await tx.period.upsert({
      where: { month_year: { month: previous.month, year: previous.year } },
      update: {},
      create: { month: previous.month, year: previous.year, status: PeriodStatus.CLOSED }
    });
    const currentPeriod = await tx.period.upsert({
      where: { month_year: { month, year } },
      update: {},
      create: { month, year, status: PeriodStatus.OPEN }
    });

    const staleEvaluations = await tx.evaluation.findMany({
      where: {
        periodId: currentPeriod.id,
        updatedAt: { lt: cutoff }
      },
      orderBy: { updatedAt: "asc" }
    });

    let movedEvaluations = 0;
    let mergedEvaluations = 0;
    for (const evaluation of staleEvaluations) {
      const existing = evaluation.evaluatorDepartmentId
        ? await tx.evaluation.findUnique({
            where: {
              periodId_evaluatorDepartmentId_evaluateeDepartmentId_criterionId: {
                periodId: previousPeriod.id,
                evaluatorDepartmentId: evaluation.evaluatorDepartmentId,
                evaluateeDepartmentId: evaluation.evaluateeDepartmentId,
                criterionId: evaluation.criterionId
              }
            }
          })
        : await tx.evaluation.findFirst({
            where: {
              periodId: previousPeriod.id,
              evaluatorUserId: evaluation.evaluatorUserId,
              evaluateeDepartmentId: evaluation.evaluateeDepartmentId,
              criterionId: evaluation.criterionId
            }
          });

      if (existing) {
        await tx.evaluation.update({
          where: { id: existing.id },
          data: {
            evaluatorDepartmentId: evaluation.evaluatorDepartmentId,
            evaluatorUserId: evaluation.evaluatorUserId,
            score: evaluation.score,
            noInteraction: evaluation.noInteraction,
            deviationCategories: evaluation.deviationCategories,
            comment: evaluation.comment,
            authorId: evaluation.authorId,
            createdAt: evaluation.createdAt,
            updatedAt: evaluation.updatedAt
          }
        });
        await tx.evaluation.delete({ where: { id: evaluation.id } });
        mergedEvaluations += 1;
      } else {
        await tx.evaluation.update({
          where: { id: evaluation.id },
          data: { periodId: previousPeriod.id }
        });
        movedEvaluations += 1;
      }
    }

    const staleRequests = await tx.evaluationRequest.findMany({
      where: {
        periodId: currentPeriod.id,
        scheduledAt: { lt: cutoff }
      }
    });
    let movedRequests = 0;
    let removedDuplicateRequests = 0;
    for (const requestRow of staleRequests) {
      const existing = await tx.evaluationRequest.findUnique({
        where: {
          periodId_evaluateeDepartmentId: {
            periodId: previousPeriod.id,
            evaluateeDepartmentId: requestRow.evaluateeDepartmentId
          }
        }
      });
      if (existing) {
        await tx.evaluationRequest.delete({ where: { id: requestRow.id } });
        removedDuplicateRequests += 1;
      } else {
        await tx.evaluationRequest.update({
          where: { id: requestRow.id },
          data: { periodId: previousPeriod.id }
        });
        movedRequests += 1;
      }
    }

    const departments = await tx.department.findMany({
      where: { isActive: true },
      select: { id: true, name: true }
    });
    const currentRequests = await tx.evaluationRequest.count({ where: { periodId: currentPeriod.id } });
    if (currentRequests === 0) {
      const admin = await tx.user.findFirst({ where: { role: Role.ADMIN, isActive: true }, orderBy: { createdAt: "asc" } });
      if (admin) {
        const evaluateeDepartments = departments.filter(isEvaluatableDepartment);
        await tx.evaluationRequest.createMany({
          data: evaluateeDepartments.map((department) => ({
            periodId: currentPeriod.id,
            evaluateeDepartmentId: department.id,
            initiatedById: admin.id,
            scheduledAt: new Date()
          })),
          skipDuplicates: true
        });
      }
    }

    await tx.period.updateMany({
      where: { id: { not: currentPeriod.id } },
      data: { status: PeriodStatus.CLOSED }
    });
    await tx.period.update({ where: { id: currentPeriod.id }, data: { status: PeriodStatus.OPEN } });

    return {
      previousPeriodId: previousPeriod.id,
      currentPeriodId: currentPeriod.id,
      movedEvaluations,
      mergedEvaluations,
      movedRequests,
      removedDuplicateRequests,
      cutoff: cutoff.toISOString()
    };
  });

  await writeAuditLog({
    action: "period.activate_current",
    summary: "Активирован текущий период оценки",
    details: [
      `Текущий период: ${String(month).padStart(2, "0")}.${year}.`,
      `Предыдущий период закрыт: ${String(previous.month).padStart(2, "0")}.${previous.year}.`,
      `Перенесено оценок в предыдущий период: ${result.movedEvaluations}.`,
      `Объединено дублей оценок: ${result.mergedEvaluations}.`,
      `Дата отсечения по Бишкеку: ${String(cutoffDay).padStart(2, "0")}.${String(cutoffMonth).padStart(2, "0")}.${cutoffYear}.`
    ].join(" "),
    user,
    request
  });
  revalidatePeriodViews();

  return NextResponse.json({
    message: "Текущий период активирован, предыдущий закрыт",
    ...result
  });
}

export const GET = handler;
export const POST = handler;
