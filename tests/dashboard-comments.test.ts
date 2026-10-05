import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { getPeriodMetrics } from "../lib/metrics";

const departments = [
  ["uchr", "УЧР"], ["marketing", "Маркетинг"], ["ova", "ОВА"],
  ["peo", "ПЭО"], ["accounting", "Бухгалтерия"], ["orp", "ОРП"], ["ocp", "ОЦП"]
].map(([id, name]) => ({ id, name, shortName: "", isActive: true }));
const periods = [{ id: "september", month: 9, year: 2026, status: "OPEN" }, { id: "august", month: 8, year: 2026, status: "CLOSED" }];
const criterion = { id: "overall", name: "Общая оценка взаимодействия" };
const rows = [
  { id: "marketing-8", evaluatorDepartmentId: "marketing", score: 8, comment: "Маркетинг: задержка обратной связи", periodId: "september" },
  { id: "ova-7", evaluatorDepartmentId: "ova", score: 7, comment: "ОВА: документы предоставлены не полностью", periodId: "september" },
  { id: "peo-9", evaluatorDepartmentId: "peo", score: 9, comment: "ПЭО: несвоевременное согласование", periodId: "september" },
  { id: "ocp-8", evaluatorDepartmentId: "ocp", score: 8, comment: "ОЦП: недостаточная координация действий", periodId: "september" },
  { id: "accounting-missing", evaluatorDepartmentId: "accounting", score: 8, comment: "Автоматически отмечено: оценка не заполнена до установленного срока", periodId: "september" },
  { id: "orp-no-interaction", evaluatorDepartmentId: "orp", score: 7, comment: "Нет взаимодействия", periodId: "september", noInteraction: true },
  { id: "marketing-august", evaluatorDepartmentId: "marketing", score: 6, comment: "Комментарий за август", periodId: "august" }
].map((row) => ({
  noInteraction: false, ...row, evaluateeDepartmentId: "uchr", criterionId: criterion.id, criterion,
  period: periods.find((period) => period.id === row.periodId), evaluatorUserId: null, evaluatorUser: null,
  evaluatorDepartment: departments.find((department) => department.id === row.evaluatorDepartmentId),
  evaluateeDepartment: departments[0], deviationCategories: ["Сроки"],
  author: { id: row.evaluatorDepartmentId, name: "Руководитель" }, authorId: row.evaluatorDepartmentId,
  createdAt: new Date("2026-09-25T03:00:00Z"), updatedAt: new Date("2026-09-25T03:00:00Z"), response: null
}));

function mockMetrics(t: TestContext, ocpScore = 8) {
  const data = rows.map((row) => row.id === "ocp-8" ? { ...row, score: ocpScore } : row);
  for (const [name, methods] of Object.entries({
    department: { findMany: async () => departments },
    period: { findMany: async () => periods },
    criterion: { findFirst: async () => criterion },
    evaluation: {
      findMany: async ({ where }: { where: { periodId: string | { in?: string[]; not?: string }; score?: { lte?: number; not?: null }; noInteraction?: boolean } }) => data.filter((row) => {
        const periodMatches = typeof where.periodId === "string" ? row.periodId === where.periodId
          : where.periodId.in ? where.periodId.in.includes(row.periodId) : row.periodId !== where.periodId.not;
        return periodMatches && (where.noInteraction == null || row.noInteraction === where.noInteraction) &&
          (where.score?.lte == null || row.score <= where.score.lte);
      })
    }
  })) {
    const key = name as "department" | "period" | "criterion" | "evaluation";
    const original = prisma[key];
    Object.defineProperty(prisma, key, { value: methods, configurable: true });
    t.after(() => Object.defineProperty(prisma, key, { value: original, configurable: true }));
  }
}

test("UCHR dashboard retains original comments for scores eight and below, including evaluator-only departments", async (t) => {
  mockMetrics(t);
  const metrics = await getPeriodMetrics("september");
  const lowComments = metrics.lowScores.filter((row) => row.evaluateeDepartmentId === "uchr");
  assert.deepEqual(lowComments.map((row) => [row.score, row.comment]), [
    [8, "Маркетинг: задержка обратной связи"],
    [7, "ОВА: документы предоставлены не полностью"],
    [9, "ПЭО: несвоевременное согласование"],
    [8, "ОЦП: недостаточная координация действий"]
  ]);
  assert.equal(metrics.byEvaluatee.find((row) => row.department.id === "uchr")?.lowCount, lowComments.length);
});

test("selecting a previous period returns its UCHR comments without modifying any data", async (t) => {
  mockMetrics(t);
  const metrics = await getPeriodMetrics("august");
  assert.deepEqual(metrics.lowScores.map((row) => row.comment), ["Комментарий за август"]);
  assert.equal(rows.find((row) => row.id === "marketing-8")?.comment, "Маркетинг: задержка обратной связи");
});

for (const score of [7, 8]) {
  test(`OCP to UCHR score ${score} keeps its original comment in dashboard metrics`, async (t) => {
    mockMetrics(t, score);
    const metrics = await getPeriodMetrics("september");
    const evaluation = metrics.lowScores.find((row) => row.evaluatorDepartmentId === "ocp" && row.evaluateeDepartmentId === "uchr");
    assert.equal(evaluation?.score, score);
    assert.equal(evaluation?.comment, "ОЦП: недостаточная координация действий");
  });
}
