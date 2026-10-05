import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { GET as markNoInteraction } from "../app/api/no-interaction/route";
import {
  getEvaluationMailRecipients,
  processAutomaticEvaluationMail
} from "../lib/evaluation-mail-schedule";
import { createNoInteractionToken } from "../lib/no-interaction-token";
import { prisma } from "../lib/prisma";

const departments = [
  ["ts", "ТС"], ["ocp", "ОЦП"], ["uchr", "УЧР"], ["peo", "ПЭО"],
  ["marketing", "Маркетинг"], ["accounting", "Бухгалтерия"],
  ["ova", "ОВА"], ["kro", "КРО"], ["skp", "СКП"]
].map(([id, name]) => ({ id, name, shortName: "", isActive: true }));
const leader = {
  id: "leader", name: "Руководитель ТС", email: "leader@example.test",
  role: "LEADER", isActive: true, receivesNotifications: true,
  departmentId: "ts", department: departments[0]
};
const evaluations = [
  { id: "1", evaluateeDepartmentId: "ocp", score: 10, noInteraction: false, comment: null },
  { id: "2", evaluateeDepartmentId: "uchr", score: null, noInteraction: true, comment: null },
  { id: "3", evaluateeDepartmentId: "peo", score: 10, noInteraction: false,
    comment: "Автоматически отмечено: оценка не заполнена до установленного срока" },
  { id: "4", evaluateeDepartmentId: "marketing", score: null, noInteraction: false, comment: null },
  { id: "5", evaluateeDepartmentId: "accounting", score: 9, noInteraction: false, comment: "Задержка" }
].map((evaluation) => ({ ...evaluation, evaluatorDepartmentId: "ts" }));

function mockReferences(t: TestContext) {
  // Replace Prisma's proxy delegates so Node can track and restore mocked methods.
  for (const name of ["department", "user", "criterion", "evaluation", "period", "emailDelivery", "auditLog"] as const) {
    const original = prisma[name];
    const methods = original as unknown as Record<string, unknown>;
    const model = Object.fromEntries(
      ["findMany", "findUnique", "findFirst", "create", "update", "count"].map((key) => [key, methods[key]])
    );
    Object.defineProperty(prisma, name, { value: model, configurable: true });
    t.after(() => Object.defineProperty(prisma, name, { value: original, configurable: true }));
  }
  t.mock.method(prisma.department, "findMany", async () => departments);
  t.mock.method(prisma.user, "findMany", async (args: { where: { role: string } }) =>
    args.where.role === "LEADER" ? [leader] : []
  );
  t.mock.method(prisma.criterion, "findFirst", async () => ({ id: "overall" }));
  t.mock.method(prisma.evaluation, "findMany", async () => evaluations);
  t.mock.method(prisma.period, "findUnique", async () => ({
    id: "period", month: 9, year: 2026, status: "OPEN"
  }));
  t.mock.method(prisma.period, "findFirst", async () => null);
}

test("mail lists all unfilled evaluatees and excludes self, evaluator-only departments and saved answers", async (t) => {
  mockReferences(t);
  const [recipient] = await getEvaluationMailRecipients("period");

  assert.deepEqual(recipient.missingTargets.map((department) => department.name), ["ПЭО", "Маркетинг"]);
  assert.deepEqual(recipient.targets.map((department) => department.name),
    ["ОЦП", "УЧР", "ПЭО", "Маркетинг", "Бухгалтерия"]);
});

test("mail recognizes scores saved under the resolved accounting department", async (t) => {
  mockReferences(t);
  t.mock.method(prisma.user, "findMany", async () => [{
    ...leader, departmentId: "chief-accountant",
    department: { id: "chief-accountant", name: "Главный бухгалтер", isActive: true }
  }]);
  t.mock.method(prisma.evaluation, "findMany", async () => [{
    evaluatorDepartmentId: "accounting", evaluateeDepartmentId: "marketing",
    score: 10, noInteraction: false, comment: null
  }]);

  const [recipient] = await getEvaluationMailRecipients("period");
  assert.equal(recipient.evaluatorDepartmentId, "accounting");
  assert.ok(!recipient.targets.some((department) => department.id === "accounting"));
  assert.ok(!recipient.missingTargets.some((department) => department.id === "marketing"));
});

test("automatic mail runs only on 1, 4 and 6 in Bishkek and marks only the 6th as overdue", async (t) => {
  mockReferences(t);
  const previousHost = process.env.SMTP_HOST;
  delete process.env.SMTP_HOST;
  t.after(() => {
    if (previousHost == null) delete process.env.SMTP_HOST;
    else process.env.SMTP_HOST = previousHost;
  });
  const queued: { subject: string; context: string }[] = [];
  t.mock.method(prisma.emailDelivery, "create", async ({ data }: { data: { subject: string; context: string } }) => {
    queued.push(data);
    return { id: String(queued.length) };
  });
  t.mock.method(prisma.emailDelivery, "update", async () => ({}));
  t.mock.method(prisma.emailDelivery, "count", async ({ where }: { where: { status: { in: string[] } } }) => {
    assert.deepEqual(where.status.in, ["PENDING", "SENT"]);
    return 0;
  });

  // 18:00 UTC is the start of the next calendar day in Bishkek.
  for (let day = 1; day <= 31; day += 1) {
    const before = queued.length;
    await processAutomaticEvaluationMail(new Date(Date.UTC(2026, 9, day - 1, 18)));
    assert.equal(queued.length - before, [1, 4, 6].includes(day) ? 1 : 0, `October ${day}`);
  }
  assert.deepEqual(queued.map((mail) => mail.context), [
    "monthly_start:2026-10-01", "missing_reminder:2026-10-04", "missing_reminder:2026-10-06"
  ]);
  assert.match(queued[1].subject, /^Напоминание:/);
  assert.match(queued[2].subject, /^Просрочено:/);
});

test("a leader who has answered every department receives no scheduled mail", async (t) => {
  mockReferences(t);
  t.mock.method(prisma.evaluation, "findMany", async () => departments.map((department) => ({
    evaluatorDepartmentId: "ts", evaluateeDepartmentId: department.id,
    score: 10, noInteraction: false, comment: null
  })));
  t.mock.method(prisma.emailDelivery, "create", () => assert.fail("Unexpected email"));
  for (const day of [1, 4, 6]) {
    const result = await processAutomaticEvaluationMail(new Date(`2026-10-0${day}T09:00:00+06:00`));
    assert.equal(result.monthlyStartRecipients, 0);
    assert.equal(result.reminderRecipients, 0);
  }
});

test("rerunning a scheduled day skips mail that is already sent or pending", async (t) => {
  mockReferences(t);
  t.mock.method(prisma.emailDelivery, "count", async () => 1);
  t.mock.method(prisma.emailDelivery, "create", () => assert.fail("Duplicate email"));
  for (const day of [1, 4, 6]) {
    await processAutomaticEvaluationMail(new Date(`2026-10-0${day}T09:00:00+06:00`));
  }
});

test("email no-interaction action covers optional departments and preserves saved scores", async (t) => {
  mockReferences(t);
  t.mock.method(prisma.user, "findUnique", async () => leader);
  t.mock.method(prisma.department, "findUnique", async () => departments[0]);
  t.mock.method(prisma.auditLog, "create", async () => ({}));
  const changed: string[] = [];
  t.mock.method(prisma.evaluation, "update", async ({ data }: { data: { evaluateeDepartmentId: string } }) => {
    changed.push(data.evaluateeDepartmentId);
    return {};
  });
  t.mock.method(prisma.evaluation, "create", () => assert.fail("Existing empty rows should be updated"));
  const token = createNoInteractionToken({
    periodId: "period", evaluatorDepartmentId: "ts", userId: leader.id
  }, new Date(Date.now() + 60_000));

  const response = await markNoInteraction(new Request(`https://example.test/api/no-interaction?token=${token}`));
  assert.equal(response.status, 200);
  assert.deepEqual(changed, ["peo", "marketing"]);
});

test("email no-interaction action accepts the leader's resolved accounting department", async (t) => {
  mockReferences(t);
  t.mock.method(prisma.user, "findUnique", async () => ({
    ...leader, departmentId: "chief-accountant",
    department: { id: "chief-accountant", name: "Главный бухгалтер", isActive: true }
  }));
  t.mock.method(prisma.department, "findUnique", async () => departments[5]);
  t.mock.method(prisma.evaluation, "findMany", async () => []);
  t.mock.method(prisma.auditLog, "create", async () => ({}));
  const marked: string[] = [];
  t.mock.method(prisma.evaluation, "create", async ({ data }: { data: { evaluatorDepartmentId: string } }) => {
    marked.push(data.evaluatorDepartmentId);
    return {};
  });
  const token = createNoInteractionToken({
    periodId: "period", evaluatorDepartmentId: "accounting", userId: leader.id
  }, new Date(Date.now() + 60_000));

  const response = await markNoInteraction(new Request(`https://example.test/api/no-interaction?token=${token}`));
  assert.equal(response.status, 200);
  assert.equal(marked.length, 5);
  assert.ok(marked.every((id) => id === "accounting"));
});

test("email no-interaction action refuses a closed assessment period", async (t) => {
  mockReferences(t);
  t.mock.method(prisma.period, "findUnique", async () => ({ id: "period", status: "CLOSED" }));
  t.mock.method(prisma.user, "findUnique", async () => leader);
  t.mock.method(prisma.department, "findUnique", async () => departments[0]);
  t.mock.method(prisma.evaluation, "update", () => assert.fail("Closed period must not change"));
  t.mock.method(prisma.evaluation, "create", () => assert.fail("Closed period must not change"));
  const token = createNoInteractionToken({
    periodId: "period", evaluatorDepartmentId: "ts", userId: leader.id
  }, new Date(Date.now() + 60_000));

  const response = await markNoInteraction(new Request(`https://example.test/api/no-interaction?token=${token}`));
  assert.equal(response.status, 400);
});
