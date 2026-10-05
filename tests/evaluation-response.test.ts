import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { Role } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { canRespondToEvaluation, serializeEvaluationResponse } from "../lib/evaluation-response";
import { getResponseDepartmentIds, saveEvaluationResponse, ResponseError } from "../lib/evaluation-response-service";
import { paginateComments } from "../lib/presentation-comments";

const user = { id: "leader", name: "Руководитель", role: Role.LEADER, isActive: true, department: { id: "hr", name: "УЧР", shortName: "" } };
const evaluation = { id: "evaluation", evaluateeDepartmentId: "hr", score: 8, noInteraction: false, comment: "Замечание", updatedAt: new Date("2026-09-01"), response: null };
const departments = [
  { id: "hr", name: "УЧР", shortName: "", leaderUserId: user.id, deputyUserId: null, directorAssignments: [] },
  { id: "other", name: "Другой отдел", shortName: "", leaderUserId: null, deputyUserId: null, directorAssignments: [] }
];

function replace(t: TestContext, key: "department" | "$transaction", value: unknown) {
  const original = prisma[key];
  Object.defineProperty(prisma, key, { configurable: true, value });
  t.after(() => Object.defineProperty(prisma, key, { configurable: true, value: original }));
}

test("only actual scores from one through nine allow department responses", () => {
  for (const score of [1, 7, 8, 9]) assert.equal(canRespondToEvaluation(user, { ...evaluation, score }, ["hr"]), true);
  for (const score of [null, 0, 10]) assert.equal(canRespondToEvaluation(user, { ...evaluation, score }, ["hr"]), false);
  assert.equal(canRespondToEvaluation(user, { ...evaluation, noInteraction: true }, ["hr"]), false);
  assert.equal(canRespondToEvaluation(user, { ...evaluation, comment: "Автоматически отмечено: оценка не заполнена" }, ["hr"]), false);
});

test("own department, assigned director and administrator can reply; unrelated or disabled users cannot", () => {
  assert.equal(canRespondToEvaluation(user, evaluation, ["other"]), false);
  assert.equal(canRespondToEvaluation({ ...user, role: Role.DIRECTOR }, evaluation, ["hr"]), true);
  assert.equal(canRespondToEvaluation({ ...user, role: Role.DIRECTOR }, evaluation, []), false);
  assert.equal(canRespondToEvaluation({ ...user, role: Role.ADMIN }, evaluation, []), true);
  assert.equal(canRespondToEvaluation({ ...user, role: Role.ANALYST }, evaluation, ["hr"]), false);
  assert.equal(canRespondToEvaluation({ ...user, isActive: false }, evaluation, ["hr"]), false);
});

test("scope includes explicit leader/deputy assignments, not similar department names", async (t) => {
  replace(t, "department", { findMany: async () => [...departments, { ...departments[1], id: "deputy", deputyUserId: user.id }] });
  assert.deepEqual(await getResponseDepartmentIds(user), ["hr", "deputy"]);
  assert.deepEqual(await getResponseDepartmentIds({ ...user, department: { id: "missing", name: "Другой отдел", shortName: "" } }), ["hr", "deputy"]);
  assert.deepEqual(await getResponseDepartmentIds({ ...user, role: Role.DIRECTOR }), []);
});

test("empty, invalid and overlong answers never reach persistence", async () => {
  for (const text of [null, 42, "   ", "x".repeat(301)]) {
    await assert.rejects(saveEvaluationResponse(user, evaluation.id, text, new Request("http://localhost")), (error) => error instanceof ResponseError && error.status === 400);
  }
});

for (const score of [8, 9]) for (const editing of [false, true]) {
  test(`${editing ? "editing" : "creating"} a response to score ${score} saves author and audit atomically without modifying score or evaluation timestamp`, async (t) => {
    replace(t, "department", { findMany: async () => departments });
    const upsert = t.mock.fn(async (args) => ({ ...args.create, updatedAt: new Date("2026-10-05T03:00:00Z"), author: { name: user.name } }));
    const audit = t.mock.fn(async () => ({}));
    replace(t, "$transaction", async (callback: (tx: unknown) => Promise<unknown>) => callback({
      evaluation: { findUnique: async () => ({ ...evaluation, score, response: editing ? { text: "Прежний ответ" } : null }) },
      evaluationResponse: { upsert }, auditLog: { create: audit }
    }));
    const saved = await saveEvaluationResponse(user, evaluation.id, "  Проверим\n документы  ", new Request("http://localhost"));
    assert.equal(saved.text, "Проверим документы");
    assert.equal(upsert.mock.calls[0].arguments[0].create.authorId, user.id);
    assert.equal(audit.mock.calls[0].arguments[0].data.action, "evaluation.response");
    const details = JSON.parse(audit.mock.calls[0].arguments[0].data.details);
    assert.equal(details.previousText, editing ? "Прежний ответ" : null);
    assert.equal(evaluation.score, 8);
    assert.equal(evaluation.updatedAt.toISOString(), "2026-09-01T00:00:00.000Z");
    assert.equal(serializeEvaluationResponse(saved)?.updatedAt, "2026-10-05T03:00:00.000Z");
  });
}

test("foreign department response is rejected before upsert or audit", async (t) => {
  replace(t, "department", { findMany: async () => departments });
  replace(t, "$transaction", async (callback: (tx: unknown) => Promise<unknown>) => callback({
    evaluation: { findUnique: async () => ({ ...evaluation, evaluateeDepartmentId: "other" }) }
  }));
  await assert.rejects(saveEvaluationResponse(user, evaluation.id, "Ответ", new Request("http://localhost")), (error) => error instanceof ResponseError && error.status === 403);
});

test("presentation pagination preserves long comments and places the complete response beneath the last segment", () => {
  const comment = "Длинный комментарий.\n".repeat(80);
  const response = { text: "Краткий ответ ".repeat(20), authorName: user.name, updatedAt: "2026-10-05T03:00:00Z" };
  const pages = paginateComments([{ id: "one", comment, evaluatorName: "ОВА", evaluateeName: "УЧР", response }]);
  assert.ok(pages.length > 1);
  const segments = pages.flat();
  assert.equal(segments.map((segment) => segment.comment).join(""), comment);
  assert.equal(segments.filter((segment) => segment.response).length, 1);
  assert.deepEqual(segments.at(-1)?.response, response);
  assert.ok(segments.every((segment) => segment.comment!.length <= 240));
});
