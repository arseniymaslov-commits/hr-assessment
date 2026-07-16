import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { DEVIATION_CATEGORIES } from "../lib/evaluation-categories";
import { validateEvaluationInput } from "../lib/evaluation-validation";
import { hashPassword, verifyPassword } from "../lib/password";

test("login password flow accepts the right password and rejects a wrong one", async () => {
  const hash = await hashPassword("SecurePassword123");

  assert.equal(await verifyPassword("SecurePassword123", hash), true);
  assert.equal(await verifyPassword("wrong-password", hash), false);
});

test("evaluation validation enforces comments and categories below 10", () => {
  assert.equal(
    validateEvaluationInput({
      noInteraction: false,
      score: 9,
      comment: "",
      deviationCategories: [DEVIATION_CATEGORIES[0]]
    }),
    "Для оценки ниже 10 комментарий обязателен"
  );

  assert.equal(
    validateEvaluationInput({
      noInteraction: false,
      score: 9,
      comment: "Ответ задержан",
      deviationCategories: []
    }),
    "Для оценки ниже 10 выберите категорию отклонения"
  );

  assert.equal(
    validateEvaluationInput({
      noInteraction: false,
      score: 9,
      comment: "Ответ задержан",
      deviationCategories: [DEVIATION_CATEGORIES[0]]
    }),
    null
  );

  assert.equal(
    validateEvaluationInput({
      noInteraction: false,
      score: 10,
      comment: "",
      deviationCategories: []
    }),
    null
  );
});

test("excel export smoke test creates workbook with required sheets", () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([{ department: "УЧР", score: 9.5 }]),
    "Сводка"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet([{ category: DEVIATION_CATEGORIES[0], count: 2 }]),
    "Категории отклонений"
  );

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

  assert.deepEqual(workbook.SheetNames, ["Сводка", "Категории отклонений"]);
  assert.ok(buffer.length > 1000);
});
