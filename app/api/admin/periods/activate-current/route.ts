import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { PeriodStatus, Role } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { isEvaluatableDepartment } from "@/lib/evaluation-scope";
import { prisma } from "@/lib/prisma";

const TIME_ZONE = "Asia/Bishkek";

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
  if (user?.role !== Role.ADMIN) {
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

    const mergedEvaluations = await tx.$executeRaw`
      WITH conflicts AS (
        SELECT current_eval.id AS current_id, previous_eval.id AS previous_id
        FROM "Evaluation" current_eval
        JOIN "Evaluation" previous_eval
          ON previous_eval."periodId" = ${previousPeriod.id}
          AND previous_eval."evaluateeDepartmentId" = current_eval."evaluateeDepartmentId"
          AND previous_eval."criterionId" = current_eval."criterionId"
          AND COALESCE(previous_eval."evaluatorDepartmentId", '') = COALESCE(current_eval."evaluatorDepartmentId", '')
          AND COALESCE(previous_eval."evaluatorUserId", '') = COALESCE(current_eval."evaluatorUserId", '')
        WHERE current_eval."periodId" = ${currentPeriod.id}
          AND current_eval."updatedAt" < ${cutoff}
      ),
      updated_previous AS (
        UPDATE "Evaluation" previous_eval
        SET
          "evaluatorDepartmentId" = current_eval."evaluatorDepartmentId",
          "evaluatorUserId" = current_eval."evaluatorUserId",
          "score" = current_eval."score",
          "noInteraction" = current_eval."noInteraction",
          "deviationCategories" = current_eval."deviationCategories",
          "comment" = current_eval."comment",
          "authorId" = current_eval."authorId",
          "createdAt" = current_eval."createdAt",
          "updatedAt" = current_eval."updatedAt"
        FROM conflicts
        JOIN "Evaluation" current_eval ON current_eval.id = conflicts.current_id
        WHERE previous_eval.id = conflicts.previous_id
        RETURNING conflicts.current_id
      )
      DELETE FROM "Evaluation" stale_eval
      WHERE stale_eval.id IN (SELECT current_id FROM updated_previous)
    `;

    const movedEvaluations = await tx.$executeRaw`
      UPDATE "Evaluation"
      SET "periodId" = ${previousPeriod.id}
      WHERE "periodId" = ${currentPeriod.id}
        AND "updatedAt" < ${cutoff}
    `;

    const removedDuplicateRequests = await tx.$executeRaw`
      DELETE FROM "EvaluationRequest" current_request
      WHERE current_request."periodId" = ${currentPeriod.id}
        AND current_request."scheduledAt" < ${cutoff}
        AND EXISTS (
          SELECT 1
          FROM "EvaluationRequest" previous_request
          WHERE previous_request."periodId" = ${previousPeriod.id}
            AND previous_request."evaluateeDepartmentId" = current_request."evaluateeDepartmentId"
        )
    `;

    const movedRequests = await tx.$executeRaw`
      UPDATE "EvaluationRequest"
      SET "periodId" = ${previousPeriod.id}
      WHERE "periodId" = ${currentPeriod.id}
        AND "scheduledAt" < ${cutoff}
    `;

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
  }, { timeout: 60_000, maxWait: 10_000 });

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
