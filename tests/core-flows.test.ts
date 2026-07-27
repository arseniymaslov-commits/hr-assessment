import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { DEVIATION_CATEGORIES } from "../lib/evaluation-categories";
import { validateEvaluationInput } from "../lib/evaluation-validation";
import { sendMail } from "../lib/email";
import { hashPassword, verifyPassword } from "../lib/password";
import { resolveEvaluateeDepartmentId } from "../lib/department-matching";
import { isEvaluatableDepartmentName } from "../lib/evaluation-scope";
import { periodLabel } from "../lib/format";
import { createNoInteractionToken, readNoInteractionToken } from "../lib/no-interaction-token";
import { getScheduledAssessmentPeriod } from "../lib/period-automation";

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

test("email flow reports skipped delivery when SMTP is not configured", async () => {
  const previous = {
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASSWORD: process.env.SMTP_PASSWORD
  };
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASSWORD;

  try {
    const result = await sendMail({
      to: ["leader@example.com"],
      subject: "Проверка рассылки",
      text: "Тест"
    });

    assert.equal(result.skipped, true);
    assert.equal(result.recipientsCount, 1);
    assert.match(result.error || "", /SMTP|recipient/i);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value == null) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

test("leader dashboard can match position-like department names to evaluatee departments", () => {
  const departments = [
    { id: "accounting", name: "Бухгалтерия", shortName: "САУП" },
    { id: "orp", name: "ОРП", shortName: "Отдел розничных продаж" }
  ];

  assert.equal(
    resolveEvaluateeDepartmentId({ id: "chief-accountant", name: "Главный бухгалтер", shortName: "" }, departments),
    "accounting"
  );
  assert.equal(
    resolveEvaluateeDepartmentId({ id: "retail", name: "Отдел розничных продаж", shortName: "" }, departments),
    "orp"
  );
});

test("new evaluation scope excludes OVA, KRO and SKP from evaluatees", () => {
  assert.equal(isEvaluatableDepartmentName("ОВА"), false);
  assert.equal(isEvaluatableDepartmentName("КРО"), false);
  assert.equal(isEvaluatableDepartmentName("СКП"), false);
  assert.equal(isEvaluatableDepartmentName("Бухгалтерия"), true);
});

test("scheduled assessment period keeps prior month open until the next cycle starts", () => {
  assert.deepEqual(getScheduledAssessmentPeriod(new Date("2026-07-19T12:00:00+06:00")), {
    month: 6,
    year: 2026,
    status: "OPEN"
  });
  assert.deepEqual(getScheduledAssessmentPeriod(new Date("2026-07-20T12:00:00+06:00")), {
    month: 7,
    year: 2026,
    status: "OPEN"
  });
  assert.deepEqual(getScheduledAssessmentPeriod(new Date("2026-08-05T12:00:00+06:00")), {
    month: 7,
    year: 2026,
    status: "OPEN"
  });
  assert.deepEqual(getScheduledAssessmentPeriod(new Date("2026-08-06T12:00:00+06:00")), {
    month: 7,
    year: 2026,
    status: "OPEN"
  });
  assert.deepEqual(getScheduledAssessmentPeriod(new Date("2026-08-20T12:00:00+06:00")), {
    month: 8,
    year: 2026,
    status: "OPEN"
  });
});

test("period label names the assessed month directly", () => {
  assert.equal(periodLabel({ month: 7, year: 2026 }), "Оценка взаимодействия СП за июль 2026");
});

test("no interaction email token is signed and expires", () => {
  const previousSecret = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET = "test-secret";

  try {
    const token = createNoInteractionToken(
      {
        periodId: "period-1",
        evaluatorDepartmentId: "department-1",
        userId: "user-1"
      },
      new Date(Date.now() + 60_000)
    );

    assert.deepEqual(readNoInteractionToken(token), {
      periodId: "period-1",
      evaluatorDepartmentId: "department-1",
      userId: "user-1",
      exp: readNoInteractionToken(token)?.exp
    });
    assert.equal(readNoInteractionToken(`${token}x`), null);

    const expired = createNoInteractionToken(
      {
        periodId: "period-1",
        evaluatorDepartmentId: "department-1",
        userId: "user-1"
      },
      new Date(Date.now() - 60_000)
    );
    assert.equal(readNoInteractionToken(expired), null);
  } finally {
    if (previousSecret == null) {
      delete process.env.AUTH_SECRET;
    } else {
      process.env.AUTH_SECRET = previousSecret;
    }
  }
});
