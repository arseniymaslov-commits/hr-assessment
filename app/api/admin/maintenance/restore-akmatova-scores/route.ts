import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const RESTORE_ROWS: Array<{ label: string; score: number | null; noInteraction?: boolean }> = [
  { label: "Бухгалтерия", score: 9 },
  { label: "Маркетинг", score: 9 },
  { label: "ОДТ", score: 9 },
  { label: "ОИАР", score: 10 },
  { label: "ОИБ", score: 9 },
  { label: "ОК", score: 9 },
  { label: "ОКИ", score: 9 },
  { label: "ОКП", score: 9 },
  { label: "ОКС", score: 10 },
  { label: "ОМТС", score: 8 },
  { label: "ОП", score: 9 },
  { label: "ОПЗИ", score: 8 },
  { label: "ОПРМ", score: 10 },
  { label: "ОРС", score: 9 },
  { label: "ОРП", score: 9 },
  { label: "ОРСБ", score: 10 },
  { label: "Отдел электрозарядных станций", score: null, noInteraction: true },
  { label: "ОТТБПБ", score: 9 },
  { label: "ОЦП", score: 7 },
  { label: "ПЭО", score: 10 },
  { label: "СБ", score: 10 },
  { label: "СВКА", score: 10 },
  { label: "СиСО", score: 10 },
  { label: "ССБН", score: 9 },
  { label: "СЭТС", score: 8 },
  { label: "ТД", score: 10 },
  { label: "ТС", score: 9 },
  { label: "УНБХ", score: 9 }
];

function normalize(value: string) {
  return value.toLowerCase().replace(/[«»"]/g, "").replace(/\s+/g, " ").trim();
}

function departmentMatches(department: { name: string; shortName: string }, label: string) {
  const target = normalize(label);
  return normalize(department.name) === target || normalize(department.shortName) === target;
}

function findDepartment(departments: Array<{ id: string; name: string; shortName: string }>, label: string) {
  const target = normalize(label);
  return (
    departments.find((department) => normalize(department.name) === target) ||
    departments.find((department) => normalize(department.shortName) === target)
  );
}

export async function POST() {
  const user = await getCurrentUser();
  if (!user || user.role !== Role.ADMIN) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const [period, criterion, departments, zarina] = await Promise.all([
    prisma.period.findFirst({ where: { status: "OPEN" }, orderBy: [{ year: "desc" }, { month: "desc" }] }),
    prisma.criterion.findFirst({ where: { name: "Общая оценка взаимодействия" } }),
    prisma.department.findMany({ select: { id: true, name: true, shortName: true } }),
    prisma.user.findFirst({
      where: { email: "zarina.akmatova@redpetroleum.kg" },
      select: { id: true, name: true, departmentId: true }
    })
  ]);

  const uchr = departments.find(
    (department) => department.name === "УЧР" || department.shortName === "Управление человеческими ресурсами"
  );

  if (!period || !criterion || !uchr || !zarina) {
    return NextResponse.json({ error: "Не найден открытый период, критерий, УЧР или пользователь Акматова Зарина" }, { status: 400 });
  }

  let restored = 0;
  const skipped: string[] = [];
  const restoredRows: Array<{ evaluatee: string; score: number | null; noInteraction: boolean }> = [];
  const targetEvaluateeIds = new Set<string>();

  for (const row of RESTORE_ROWS) {
    const evaluatee = findDepartment(departments, row.label);
    if (!evaluatee || evaluatee.id === uchr.id) {
      skipped.push(row.label);
      continue;
    }
    targetEvaluateeIds.add(evaluatee.id);

    const existing = await prisma.evaluation.findFirst({
      where: {
        periodId: period.id,
        evaluatorDepartmentId: uchr.id,
        evaluateeDepartmentId: evaluatee.id,
        criterionId: criterion.id
      }
    });

    const data = {
      periodId: period.id,
      evaluatorDepartmentId: uchr.id,
      evaluatorUserId: null,
      evaluateeDepartmentId: evaluatee.id,
      criterionId: criterion.id,
      score: row.noInteraction ? null : row.score,
      noInteraction: Boolean(row.noInteraction),
      deviationCategories: [] as string[],
      comment: row.noInteraction ? "Нет взаимодействия за период" : null,
      authorId: zarina.id
    };

    if (existing) {
      await prisma.evaluation.update({ where: { id: existing.id }, data });
    } else {
      await prisma.evaluation.create({ data });
    }

    restored += 1;
    restoredRows.push({ evaluatee: evaluatee.name, score: data.score, noInteraction: data.noInteraction });
  }

  const cleanup = targetEvaluateeIds.size
    ? await prisma.evaluation.deleteMany({
        where: {
          periodId: period.id,
          evaluatorDepartmentId: uchr.id,
          criterionId: criterion.id,
          authorId: zarina.id,
          evaluateeDepartmentId: { notIn: Array.from(targetEvaluateeIds) }
        }
      })
    : { count: 0 };

  return NextResponse.json({
    restored,
    cleanedExtraRows: cleanup.count,
    skipped,
    restoredRows: restoredRows.sort((a, b) => a.evaluatee.localeCompare(b.evaluatee, "ru"))
  });
}
