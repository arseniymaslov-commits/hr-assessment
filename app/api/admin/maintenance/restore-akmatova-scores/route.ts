import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function normalize(value: string) {
  return value.toLowerCase().replace(/[«»"]/g, "").replace(/\s+/g, " ").trim();
}

function departmentMatches(department: { name: string; shortName: string }, label: string) {
  const target = normalize(label);
  const name = normalize(department.name);
  const shortName = normalize(department.shortName);
  return name === target || shortName === target || name.includes(target) || shortName.includes(target);
}

function parseEvaluationDetails(details: string | null) {
  const match = String(details || "").match(/^Оцениваемый отдел:\s*(.+?)\.\s*Оценка:\s*(.+?)\.$/);
  if (!match) return null;
  const [, departmentLabel, scoreLabel] = match;
  return {
    departmentLabel: departmentLabel.trim(),
    noInteraction: scoreLabel.trim() === "Нет взаимодействия",
    score: /^\d+$/.test(scoreLabel.trim()) ? Number(scoreLabel.trim()) : null
  };
}

export async function POST() {
  const user = await getCurrentUser();
  if (!user || user.role !== Role.ADMIN) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const [period, criterion, departments, zarina, logs] = await Promise.all([
    prisma.period.findFirst({ where: { status: "OPEN" }, orderBy: [{ year: "desc" }, { month: "desc" }] }),
    prisma.criterion.findFirst({ where: { name: "Общая оценка взаимодействия" } }),
    prisma.department.findMany({ select: { id: true, name: true, shortName: true } }),
    prisma.user.findFirst({
      where: { email: "zarina.akmatova@redpetroleum.kg" },
      select: { id: true, name: true, departmentId: true }
    }),
    prisma.auditLog.findMany({
      where: {
        userName: "Акматова Зарина",
        action: { in: ["evaluation.create", "evaluation.update"] },
        createdAt: {
          gte: new Date("2026-07-03T00:00:00.000Z"),
          lt: new Date("2026-07-07T03:10:00.000Z")
        }
      },
      orderBy: { createdAt: "desc" }
    })
  ]);

  const uchr = departments.find(
    (department) => department.name === "УЧР" || department.shortName === "Управление человеческими ресурсами"
  );

  if (!period || !criterion || !uchr || !zarina) {
    return NextResponse.json({ error: "Не найден открытый период, критерий, УЧР или пользователь Акматова Зарина" }, { status: 400 });
  }

  const latestByDepartment = new Map<
    string,
    { departmentLabel: string; score: number | null; noInteraction: boolean; createdAt: Date }
  >();

  for (const log of logs) {
    const parsed = parseEvaluationDetails(log.details);
    if (!parsed || (!parsed.noInteraction && parsed.score == null)) continue;
    if (!latestByDepartment.has(parsed.departmentLabel)) {
      latestByDepartment.set(parsed.departmentLabel, { ...parsed, createdAt: log.createdAt });
    }
  }

  let restored = 0;
  const skipped: string[] = [];
  const restoredRows: Array<{ evaluatee: string; score: number | null; noInteraction: boolean }> = [];

  for (const row of latestByDepartment.values()) {
    const evaluatee = departments.find((department) => departmentMatches(department, row.departmentLabel));
    if (!evaluatee || evaluatee.id === uchr.id) {
      skipped.push(row.departmentLabel);
      continue;
    }

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
      noInteraction: row.noInteraction,
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

  return NextResponse.json({
    restored,
    skipped,
    restoredRows: restoredRows.sort((a, b) => a.evaluatee.localeCompare(b.evaluatee, "ru"))
  });
}
