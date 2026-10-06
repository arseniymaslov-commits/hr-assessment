import test from "node:test";
import assert from "node:assert/strict";
import { getPresentationTrend, presentationTrendDelta, type PresentationTrendPoint } from "../lib/presentation-trend";
import { paginateComments } from "../lib/presentation-comments";

function point(month: number, average: number | null = 9): PresentationTrendPoint {
  return { period: { id: String(month), month, year: 2026 }, average, count: average == null ? 0 : 10 };
}

test("slide trend stops at the selected period and keeps six chronological points without mutating input", () => {
  const input = [9, 8, 7, 6, 5, 4, 3, 2, 1].map((month) => point(month));
  assert.deepEqual(getPresentationTrend(input, "8").map((value) => value.period.month), [3, 4, 5, 6, 7, 8]);
  assert.equal(input[0].period.month, 9);
  assert.deepEqual(getPresentationTrend(input, "missing"), []);
});

test("slide trend sorts across year boundaries and does not fill months without ratings", () => {
  const december = { ...point(12), period: { id: "dec", month: 12, year: 2025 } };
  const points = getPresentationTrend([point(2), december, point(1, null)], "2");
  assert.deepEqual(points.map((value) => value.period.id), ["dec", "1", "2"]);
  assert.equal(points[1].average, null);
  assert.equal(presentationTrendDelta(points), null);
  assert.equal(presentationTrendDelta([point(1, 9), point(2, 9.5)]), 0.5);
  assert.equal(presentationTrendDelta([point(1, 9), point(2, null)]), null);
  assert.equal(presentationTrendDelta([point(1)]), null);
});

test("compact comments keep four short comment and response pairs together", () => {
  const items = Array.from({ length: 5 }, (_, index) => ({
    id: String(index), comment: "Просим соблюдать сроки.", evaluatorName: "ОЦП", evaluateeName: "УЧР",
    response: { text: "Исправим в следующем периоде.", authorName: "Руководитель", updatedAt: "2026-10-06" }
  }));
  const pages = paginateComments(items);
  assert.deepEqual(pages.map((page) => page.length), [4, 1]);
  assert.deepEqual(pages.flat().map((item) => item.response), items.map((item) => item.response));
});
