import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import * as XLSX from "xlsx";
import { getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { departmentOptionLabel, getDepartmentFullName } from "@/lib/department-decodings";
import { getDirectorDepartmentIds } from "@/lib/director-scope";
import { DEVIATION_CATEGORIES } from "@/lib/evaluation-categories";
import { MISSING_EVALUATION_LABEL } from "@/lib/evaluation-status";
import { fixed, periodLabel } from "@/lib/format";
import { getPeriodMetrics } from "@/lib/metrics";

function appendSheet(workbook: XLSX.WorkBook, data: Record<string, unknown>[], name: string) {
  const sheet = XLSX.utils.json_to_sheet(data);
  sheet["!cols"] = Object.keys(data[0] || {}).map((key) => ({
    wch: Math.max(14, Math.min(42, key.length + 8))
  }));
  XLSX.utils.book_append_sheet(workbook, sheet, name);
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const allowedExportRoles = new Set<Role>([Role.ADMIN, Role.ANALYST, Role.DIRECTOR]);
  if (!allowedExportRoles.has(user.role)) {
    return NextResponse.json({ error: "Недостаточно прав для экспорта" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const metrics = await getPeriodMetrics(searchParams.get("period") || undefined);
  const leaderDepartmentId = null;
  const directorDepartmentIds = getDirectorDepartmentIds(user);
  const directorDepartmentIdSet = new Set(directorDepartmentIds);
  const hasDirectorScope = user.role === Role.DIRECTOR && directorDepartmentIds.length > 0;
  const canExportComments =
    user.role === Role.ADMIN || user.role === Role.DIRECTOR || user.role === Role.LEADER;
  const periodName = metrics.selectedPeriod ? periodLabel(metrics.selectedPeriod) : "period";
  await writeAuditLog({
    action: "export.excel",
    summary: "Экспорт результатов в Excel",
    details: `Период: ${periodName}`,
    user,
    request
  });
  const evaluatorDepartments = metrics.departments;
  const evaluateeDepartments = leaderDepartmentId
    ? metrics.evaluateeDepartments.filter((department) => department.id === leaderDepartmentId)
    : hasDirectorScope
      ? metrics.evaluateeDepartments.filter((department) => directorDepartmentIdSet.has(department.id))
    : metrics.evaluateeDepartments;
  const summaryRows = leaderDepartmentId
    ? metrics.byEvaluatee.filter((row) => row.department.id === leaderDepartmentId)
    : hasDirectorScope
      ? metrics.byEvaluatee.filter((row) => directorDepartmentIdSet.has(row.department.id))
    : metrics.byEvaluatee;
  const lowScoreRows = leaderDepartmentId
    ? metrics.lowScores.filter((evaluation) => evaluation.evaluateeDepartmentId === leaderDepartmentId)
    : hasDirectorScope
      ? metrics.lowScores.filter((evaluation) => directorDepartmentIdSet.has(evaluation.evaluateeDepartmentId))
    : metrics.lowScores;
  const evaluationRows = leaderDepartmentId
    ? metrics.evaluations.filter((evaluation) => evaluation.evaluateeDepartmentId === leaderDepartmentId)
    : hasDirectorScope
      ? metrics.evaluations.filter((evaluation) => directorDepartmentIdSet.has(evaluation.evaluateeDepartmentId))
    : metrics.evaluations;
  const completionRows = leaderDepartmentId
    ? metrics.completion.filter((row) => row.department.id === leaderDepartmentId)
    : hasDirectorScope
      ? metrics.completion.filter((row) => directorDepartmentIdSet.has(row.department.id))
    : metrics.completion;
  const directoryDepartments = hasDirectorScope ? evaluateeDepartments : metrics.departments;
  const exportAverage = average(
    evaluationRows
      .filter((evaluation) => !evaluation.noInteraction && evaluation.score != null)
      .map((evaluation) => evaluation.score as number)
  );
  const workbook = XLSX.utils.book_new();

  appendSheet(
    workbook,
    summaryRows.map((row) => ({
      "Период": periodName,
      "Подразделение": row.department.name,
      "Расшифровка": getDepartmentFullName(row.department.name, row.department.shortName),
      "Средний балл": row.average == null ? "" : Number(row.average.toFixed(2)),
      "Количество оценок": row.count,
      "Нет взаимодействия": row.noInteractionCount,
      "Оценок 9 и ниже": row.lowCount,
      "Изменение к прошлому месяцу": row.averageDelta == null ? "" : Number(row.averageDelta.toFixed(2))
    })),
    "Сводка"
  );

  const evaluationMap = new Map(
    metrics.evaluations
      .filter((evaluation) => evaluation.evaluatorDepartmentId)
      .map((evaluation) => [
        `${evaluation.evaluatorDepartmentId}:${evaluation.evaluateeDepartmentId}`,
        evaluation
      ])
  );
  const summaryMap = new Map(metrics.byEvaluatee.map((row) => [row.department.id, row]));
  const matrixRows: (string | number)[][] = [
    [
      "Кто оценивает / кого оценивают",
      ...evaluateeDepartments.map((department) => department.name),
      "Средняя оценка от отдела"
    ]
  ];
  for (const evaluator of evaluatorDepartments) {
    const rowScores: number[] = [];
    const row: (string | number)[] = [departmentOptionLabel(evaluator)];
    for (const evaluatee of evaluateeDepartments) {
      if (evaluator.id === evaluatee.id) {
        row.push("—");
        continue;
      }
      const evaluation = evaluationMap.get(`${evaluator.id}:${evaluatee.id}`);
      if (!evaluation) {
        row.push("");
        continue;
      }
      if (evaluation.noInteraction) {
        row.push("Нет взаимодействия");
        continue;
      }
      if (evaluation.score == null) {
        row.push(MISSING_EVALUATION_LABEL);
        continue;
      }
      row.push(evaluation.score);
      rowScores.push(evaluation.score);
    }
    row.push(rowScores.length ? Number((rowScores.reduce((sum, score) => sum + score, 0) / rowScores.length).toFixed(2)) : "");
    matrixRows.push(row);
  }
  matrixRows.push([
    "Общая оценка подразделения",
    ...evaluateeDepartments.map((department) => {
      const average = summaryMap.get(department.id)?.average;
      return average == null ? "" : Number(average.toFixed(2));
    }),
    ""
  ]);
  const matrixSheet = XLSX.utils.aoa_to_sheet(matrixRows);
  matrixSheet["!cols"] = [{ wch: 34 }, ...evaluateeDepartments.map(() => ({ wch: 16 })), { wch: 24 }];
  XLSX.utils.book_append_sheet(workbook, matrixSheet, "Матрица");

  appendSheet(
    workbook,
    lowScoreRows.map((evaluation) => ({
      "Период": periodName,
      "Кто оценивает": evaluation.evaluatorDepartment
        ? departmentOptionLabel(evaluation.evaluatorDepartment)
        : evaluation.evaluatorUser?.name || "Директор",
      "Кого оценивают": departmentOptionLabel(evaluation.evaluateeDepartment),
      "Оценка": evaluation.score,
      "Категории отклонений": evaluation.deviationCategories.join(", "),
      "Комментарий": canExportComments
        ? evaluation.score == null && !evaluation.noInteraction
          ? MISSING_EVALUATION_LABEL
          : evaluation.comment || ""
        : "",
      "Автор": evaluation.author.name,
      "Дата": evaluation.updatedAt.toISOString()
    })),
    "Комментарии 9 и ниже"
  );

  const categoryRows = DEVIATION_CATEGORIES.map((category) => {
    const matchingEvaluations = evaluationRows.filter((evaluation) =>
      evaluation.deviationCategories.includes(category)
    );
    const scores = matchingEvaluations
      .map((evaluation) => evaluation.score)
      .filter((score): score is number => typeof score === "number");
    const evaluateeNames = Array.from(
      new Set(matchingEvaluations.map((evaluation) => departmentOptionLabel(evaluation.evaluateeDepartment)))
    );
    const evaluatorNames = Array.from(
      new Set(
        matchingEvaluations.map((evaluation) =>
          evaluation.evaluatorDepartment
            ? departmentOptionLabel(evaluation.evaluatorDepartment)
            : evaluation.evaluatorUser?.name || "Директор"
        )
      )
    );

    return {
      "Период": periodName,
      "Категория": category,
      "Количество": matchingEvaluations.length,
      "Средняя оценка": scores.length
        ? Number((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(2))
        : "",
      "Оцениваемых отделов": evaluateeNames.length,
      "Оценивающих отделов": evaluatorNames.length,
      "Кого затронуло": evaluateeNames.join(", ")
    };
  });

  appendSheet(workbook, categoryRows, "Категории отклонений");

  appendSheet(
    workbook,
    evaluationRows.map((evaluation) => ({
      "Период": periodName,
      "Кто оценивает": evaluation.evaluatorDepartment
        ? departmentOptionLabel(evaluation.evaluatorDepartment)
        : evaluation.evaluatorUser?.name || "Директор",
      "Кого оценивают": departmentOptionLabel(evaluation.evaluateeDepartment),
      "Оценка": evaluation.noInteraction ? "" : evaluation.score ?? MISSING_EVALUATION_LABEL,
      "Нет взаимодействия": evaluation.noInteraction ? "Да" : "Нет",
      "Категории отклонений": evaluation.deviationCategories.join(", "),
      "Комментарий": canExportComments
        ? evaluation.score == null && !evaluation.noInteraction
          ? MISSING_EVALUATION_LABEL
          : evaluation.comment || ""
        : "",
      "Автор": evaluation.author.name,
      "Дата заполнения": evaluation.updatedAt.toISOString()
    })),
    "Все оценки"
  );

  appendSheet(
    workbook,
    completionRows.map((row) => ({
      "Период": periodName,
      "Подразделение": row.department.name,
      "Расшифровка": getDepartmentFullName(row.department.name, row.department.shortName),
      "Заполнено": row.filled,
      "Ожидается": row.expected,
      "Осталось": row.missing,
      "Статус": row.isComplete ? "Заполнено" : "Не заполнено"
    })),
    "Контроль заполнения"
  );

  appendSheet(
    workbook,
    directoryDepartments.map((department) => ({
      "Код": department.name,
      "Расшифровка": getDepartmentFullName(department.name, department.shortName)
    })),
    "Расшифровка отделов"
  );

  appendSheet(
    workbook,
    [
      {
        "Период": periodName,
        "Общий средний балл": fixed(exportAverage),
        "Ожидается оценок": completionRows.reduce((sum, row) => sum + row.expected, 0),
        "Отсутствует оценок": completionRows.reduce((sum, row) => sum + row.missing, 0)
      }
    ],
    "Итого"
  );

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  const safeName = periodName.replace(/\s+/g, "_");
  const encodedName = encodeURIComponent(`interaction_${safeName}.xlsx`);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="interaction_report.xlsx"; filename*=UTF-8''${encodedName}`
    }
  });
}

function average(scores: number[]) {
  return scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null;
}
