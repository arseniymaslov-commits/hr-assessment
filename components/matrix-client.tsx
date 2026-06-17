"use client";

import { useMemo, useState } from "react";
import { MessageSquareWarning } from "lucide-react";
import { fixed, scoreClass } from "@/lib/format";

type Department = {
  id: string;
  name: string;
  shortName: string;
};

type MatrixEvaluation = {
  id: string;
  evaluatorDepartmentId: string;
  evaluateeDepartmentId: string;
  evaluatorName: string;
  evaluateeName: string;
  score: number | null;
  noInteraction: boolean;
  comment: string | null;
  authorName: string;
  updatedAt: string;
};

type Summary = {
  departmentId: string;
  average: number | null;
  count: number;
  lowCount: number;
};

type LowComment = {
  id: string;
  evaluatorName: string;
  evaluateeName: string;
  score: number | null;
  comment: string | null;
  authorName: string;
  updatedAt: string;
};

export default function MatrixClient({
  rowDepartments,
  columnDepartments,
  evaluations,
  summaries,
  lowComments
}: {
  rowDepartments: Department[];
  columnDepartments: Department[];
  evaluations: MatrixEvaluation[];
  summaries: Summary[];
  lowComments: LowComment[];
}) {
  const [selected, setSelected] = useState<MatrixEvaluation | null>(null);
  const map = useMemo(() => {
    const next = new Map<string, MatrixEvaluation>();
    for (const evaluation of evaluations) {
      next.set(`${evaluation.evaluatorDepartmentId}:${evaluation.evaluateeDepartmentId}`, evaluation);
    }
    return next;
  }, [evaluations]);
  const summaryByDepartment = useMemo(() => {
    const next = new Map<string, Summary>();
    for (const summary of summaries) next.set(summary.departmentId, summary);
    return next;
  }, [summaries]);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          {summaries
            .slice()
            .sort((a, b) => (b.average ?? -1) - (a.average ?? -1))
                .slice(0, 3)
                .map((summary, index) => {
              const department = columnDepartments.find((item) => item.id === summary.departmentId);
              return (
                <div className="rounded-lg border border-line bg-white p-4 shadow-sm" key={summary.departmentId}>
                  <div className="text-xs font-semibold uppercase text-muted">Рейтинг #{index + 1}</div>
                  <div className="mt-1 font-semibold text-ink">{department?.name || "Подразделение"}</div>
                  <div className="mt-3 text-3xl font-semibold text-brand">{fixed(summary.average)}</div>
                  <div className="mt-1 text-sm text-muted">Оценок: {summary.count}, ниже 9: {summary.lowCount}</div>
                </div>
              );
            })}
        </div>

        <div className="overflow-x-auto rounded-lg border border-line bg-white shadow-sm">
          <table className="w-full min-w-[940px] border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 text-xs uppercase tracking-wide text-muted">
                <th className="sticky left-0 z-10 border-b border-line bg-slate-50 px-4 py-3 text-left">
                  Кто оценивает
                </th>
                {columnDepartments.map((department) => {
                  const summary = summaryByDepartment.get(department.id);
                  return (
                    <th className="border-b border-line px-3 py-3 text-center align-bottom" key={department.id}>
                      <span className="block font-semibold text-ink">{department.shortName || department.name}</span>
                      <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${scoreClass(summary?.average)}`}>
                        {fixed(summary?.average)}
                      </span>
                    </th>
                  );
                })}
                <th className="border-b border-line px-3 py-3 text-center">Средняя оценка от отдела</th>
              </tr>
            </thead>
            <tbody>
              {rowDepartments.map((evaluator) => {
                const rowScores = columnDepartments
                  .map((evaluatee) => map.get(`${evaluator.id}:${evaluatee.id}`))
                  .filter((evaluation): evaluation is MatrixEvaluation => Boolean(evaluation && !evaluation.noInteraction && evaluation.score != null))
                  .map((evaluation) => evaluation.score as number);
                const rowAverage = rowScores.length ? rowScores.reduce((sum, score) => sum + score, 0) / rowScores.length : null;

                return (
                  <tr key={evaluator.id}>
                    <th className="sticky left-0 z-10 border-b border-line bg-white px-4 py-3 text-left font-medium text-ink">
                      {evaluator.name}
                    </th>
                    {columnDepartments.map((evaluatee) => {
                      const evaluation = map.get(`${evaluator.id}:${evaluatee.id}`);
                      const isSelf = evaluator.id === evaluatee.id;
                      const selectedCell = selected?.id === evaluation?.id;
                      return (
                        <td className="border-b border-line p-2 text-center" key={evaluatee.id}>
                          {isSelf ? (
                            <div className="rounded-lg bg-slate-100 px-2 py-3 text-slate-400">—</div>
                          ) : evaluation?.noInteraction ? (
                            <button
                              className={`focus-ring w-full rounded-lg bg-slate-50 px-2 py-3 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 ${selectedCell ? "outline outline-2 outline-brand" : ""}`}
                              type="button"
                              onClick={() => setSelected(evaluation)}
                            >
                              нет взаим.
                            </button>
                          ) : evaluation ? (
                            <button
                              className={`focus-ring w-full rounded-lg px-2 py-3 font-semibold ring-1 ${scoreClass(evaluation.score)} ${selectedCell ? "outline outline-2 outline-brand" : ""}`}
                              type="button"
                              onClick={() => setSelected(evaluation)}
                              title={evaluation.comment || undefined}
                            >
                              {evaluation.score}
                            </button>
                          ) : (
                            <button
                              className="focus-ring w-full rounded-lg bg-slate-50 px-2 py-3 text-slate-400 ring-1 ring-slate-200"
                              type="button"
                              onClick={() => setSelected(null)}
                            >
                              нет
                            </button>
                          )}
                        </td>
                      );
                    })}
                    <td className="border-b border-line p-2 text-center">
                      <span className={`inline-flex min-w-16 justify-center rounded-lg px-3 py-2 font-semibold ring-1 ${scoreClass(rowAverage)}`}>
                        {fixed(rowAverage)}
                      </span>
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-slate-50">
                <th className="sticky left-0 z-10 border-t border-line bg-slate-50 px-4 py-3 text-left font-semibold text-ink">
                  Общая оценка подразделения
                </th>
                {columnDepartments.map((department) => {
                  const summary = summaryByDepartment.get(department.id);
                  return (
                    <td className="border-t border-line p-2 text-center" key={department.id}>
                      <span className={`inline-flex min-w-16 justify-center rounded-lg px-3 py-2 font-semibold ring-1 ${scoreClass(summary?.average)}`}>
                        {fixed(summary?.average)}
                      </span>
                    </td>
                  );
                })}
                <td className="border-t border-line p-2" />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <aside className="space-y-4">
        <section className="rounded-lg border border-line bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-ink">Детали ячейки</h2>
          {selected ? (
            <div className="mt-4 space-y-4">
              <div>
                <div className="text-sm text-muted">Связка</div>
                <div className="mt-1 font-medium">
                  {selected.evaluatorName} → {selected.evaluateeName}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted">Оценка</div>
                <div className="mt-1 text-3xl font-semibold text-ink">
                  {selected.noInteraction ? "Нет взаимодействия" : selected.score}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted">Автор</div>
                <div className="mt-1 text-sm text-slate-700">{selected.authorName}</div>
              </div>
              <div>
                <div className="text-sm text-muted">Комментарий</div>
                <p className="mt-1 text-sm leading-6 text-slate-700">
                  {selected.comment ||
                    (selected.noInteraction
                      ? "Подразделение отметило, что взаимодействия за период не было."
                      : "Комментарий не указан, потому что оценка 9 или выше.")}
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm leading-6 text-muted">
              Выберите ячейку с оценкой, чтобы увидеть автора и комментарий.
            </p>
          )}
        </section>

        <section className="rounded-lg border border-line bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <MessageSquareWarning className="text-brand" size={18} />
            <h2 className="font-semibold text-ink">Комментарии ниже 9</h2>
          </div>
          <div className="mt-4 max-h-[620px] space-y-3 overflow-y-auto pr-1">
            {lowComments.length ? (
              lowComments.map((item) => (
                <article className="rounded-lg border border-line bg-slate-50 p-3" key={item.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-sm font-semibold text-ink">
                      {item.evaluatorName} → {item.evaluateeName}
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${scoreClass(item.score)}`}>
                      {item.score}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-5 text-slate-700">{item.comment || "Комментарий не указан."}</p>
                  <div className="mt-2 text-xs text-muted">{item.authorName}</div>
                </article>
              ))
            ) : (
              <p className="text-sm leading-6 text-muted">За выбранный период нет оценок ниже 9 с комментариями.</p>
            )}
          </div>
        </section>
      </aside>
    </div>
  );
}
