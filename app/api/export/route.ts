import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getCurrentUser } from "@/lib/auth";
import { getPeriodMetrics } from "@/lib/metrics";
import { periodLabel } from "@/lib/format";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const metrics = await getPeriodMetrics(searchParams.get("period") || undefined);
  const periodName = metrics.selectedPeriod ? periodLabel(metrics.selectedPeriod) : "period";

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(
      metrics.byEvaluatee.map((row) => ({
        "Подразделение": row.department.name,
        "Средний балл": row.average,
        "Количество оценок": row.count,
        "Оценок ниже 9": row.lowCount
      }))
    ),
    "Средние баллы"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(
      metrics.evaluations.map((evaluation) => ({
        "Период": periodName,
        "Кто оценивает": evaluation.evaluatorDepartment?.name || evaluation.evaluatorUser?.name || "Директор",
        "Кого оценивают": evaluation.evaluateeDepartment.name,
        "Оценка": evaluation.noInteraction ? "" : evaluation.score,
        "Нет взаимодействия": evaluation.noInteraction ? "Да" : "Нет",
        "Комментарий": evaluation.comment || "",
        "Автор": evaluation.author.name,
        "Дата заполнения": evaluation.updatedAt.toISOString()
      }))
    ),
    "Оценки"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(
      metrics.completion.map((row) => ({
        "Подразделение": row.department.name,
        "Заполнено": row.filled,
        "Осталось": row.missing,
        "Статус": row.isComplete ? "Заполнено" : "Не заполнено"
      }))
    ),
    "Контроль заполнения"
  );

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  const safeName = periodName.replace(/\s+/g, "_");

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="interaction_${safeName}.xlsx"`
    }
  });
}
