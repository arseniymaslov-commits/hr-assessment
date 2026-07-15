import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RestoreRow = {
  evaluator: string;
  evaluatee: string;
  score: number | null;
  noInteraction: boolean;
  categories: string[];
  comment: string;
  author: string;
};

function stripLongName(value: string) {
  return value.split("—")[0]?.trim() || value.trim();
}

function isAutoComment(value: string | null | undefined) {
  return String(value || "")
    .toLowerCase()
    .includes("автоматически отмечено");
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== Role.ADMIN) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const rows: RestoreRow[] = Array.isArray(body?.rows) ? body.rows : [];
  if (!rows.length) {
    return NextResponse.json({ error: "Нет данных для восстановления" }, { status: 400 });
  }

  const period = await prisma.period.findFirst({
    where: { status: "OPEN" },
    orderBy: [{ year: "desc" }, { month: "desc" }]
  });
  const criterion =
    (await prisma.criterion.findFirst({ where: { name: "Общая оценка взаимодействия" } })) ||
    (await prisma.criterion.findFirst({ where: { isActive: true } }));
  if (!period || !criterion) {
    return NextResponse.json({ error: "Открытый период или критерий не найдены" }, { status: 400 });
  }

  const departments = await prisma.department.findMany({
    select: { id: true, name: true, shortName: true }
  });
  const users = await prisma.user.findMany({
    select: { id: true, name: true }
  });

  const departmentByKey = new Map<string, string>();
  for (const department of departments) {
    departmentByKey.set(department.name.trim().toLowerCase(), department.id);
    departmentByKey.set(department.shortName.trim().toLowerCase(), department.id);
  }

  let restored = 0;
  const skipped: string[] = [];

  for (const row of rows) {
    const evaluatorId = departmentByKey.get(stripLongName(row.evaluator).toLowerCase());
    const evaluateeId = departmentByKey.get(stripLongName(row.evaluatee).toLowerCase());
    if (!evaluatorId || !evaluateeId || !row.comment.trim() || isAutoComment(row.comment)) {
      skipped.push(`${row.evaluator} -> ${row.evaluatee}`);
      continue;
    }

    const existing = await prisma.evaluation.findFirst({
      where: {
        periodId: period.id,
        evaluatorDepartmentId: evaluatorId,
        evaluateeDepartmentId: evaluateeId,
        criterionId: criterion.id
      }
    });

    const author = users.find((item) => item.name.trim().toLowerCase() === row.author.trim().toLowerCase());
    const authorId = author?.id || existing?.authorId || user.id;

    await prisma.evaluation.deleteMany({
      where: {
        periodId: period.id,
        evaluatorDepartmentId: evaluatorId,
        evaluateeDepartmentId: evaluateeId,
        criterionId: { not: criterion.id },
        comment: row.comment.trim()
      }
    });

    const shouldRestore =
      !existing ||
      !String(existing.comment || "").trim() ||
      isAutoComment(existing.comment) ||
      (existing.score == null && row.score != null);

    if (!shouldRestore) {
      skipped.push(`${row.evaluator} -> ${row.evaluatee}`);
      continue;
    }

    const data = {
      periodId: period.id,
      evaluatorDepartmentId: evaluatorId,
      evaluateeDepartmentId: evaluateeId,
      criterionId: criterion.id,
      score: row.noInteraction ? null : row.score,
      noInteraction: row.noInteraction,
      deviationCategories: row.noInteraction || row.score === 10 ? [] : row.categories,
      comment: row.comment.trim(),
      authorId
    };

    if (existing) {
      await prisma.evaluation.update({ where: { id: existing.id }, data });
    } else {
      await prisma.evaluation.create({ data });
    }
    restored += 1;
  }

  return NextResponse.json({ restored, skipped: skipped.length, skippedExamples: skipped.slice(0, 10) });
}
