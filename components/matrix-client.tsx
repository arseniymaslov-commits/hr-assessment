"use client";

import { useMemo, useRef, useState } from "react";
import { MessageSquareWarning } from "lucide-react";
import DepartmentLabel from "@/components/department-label";
import { getDepartmentDisplayParts } from "@/lib/department-decodings";
import { isMissingEvaluation, MISSING_EVALUATION_LABEL } from "@/lib/evaluation-status";
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
  deviationCategories: string[];
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
  deviationCategories: string[];
  comment: string | null;
  authorName: string;
  updatedAt: string;
};

export default function MatrixClient({
  rowDepartments,
  columnDepartments,
  evaluations,
  summaries,
  lowComments,
  canViewComments
}: {
  rowDepartments: Department[];
  columnDepartments: Department[];
  evaluations: MatrixEvaluation[];
  summaries: Summary[];
  lowComments: LowComment[];
  canViewComments: boolean;
}) {
  const [selected, setSelected] = useState<MatrixEvaluation | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [focusedColumnId, setFocusedColumnId] = useState("");
  const [viewMode, setViewMode] = useState<"all" | "low" | "missing">("all");
  const topScrollRef = useRef<HTMLDivElement | null>(null);
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
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
  const stickyColumnWidth = 220;
  const matrixColumnWidth = 96;
  const averageColumnWidth = 112;
  const matrixWidth = Math.max(900, stickyColumnWidth + columnDepartments.length * matrixColumnWidth + averageColumnWidth);
  const normalizedSearch = searchQuery.trim().toLocaleLowerCase("ru-RU");
  const visibleRowDepartments = useMemo(
    () =>
      rowDepartments.filter((department) => {
        const display = getDepartmentDisplayParts(department);
        const matchesSearch =
          !normalizedSearch ||
          [display.name, display.fullName, department.shortName]
            .filter(Boolean)
            .some((value) => String(value).toLocaleLowerCase("ru-RU").includes(normalizedSearch));
        if (!matchesSearch) return false;
        if (viewMode === "all") return true;

        return columnDepartments.some((evaluatee) => {
          if (department.id === evaluatee.id) return false;
          const evaluation = map.get(`${department.id}:${evaluatee.id}`);
          if (viewMode === "missing") return !evaluation || isMissingEvaluation(evaluation);
          return Boolean(
            evaluation &&
              !isMissingEvaluation(evaluation) &&
              (evaluation.noInteraction || (evaluation.score != null && evaluation.score <= 9))
          );
        });
      }),
    [columnDepartments, map, normalizedSearch, rowDepartments, viewMode]
  );
  const visibleLowComments = useMemo(() => {
    if (!normalizedSearch) return lowComments;
    return lowComments.filter((item) =>
      [item.evaluatorName, item.evaluateeName, item.comment]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("ru-RU").includes(normalizedSearch))
    );
  }, [lowComments, normalizedSearch]);

  function syncHorizontalScroll(source: "top" | "table", scrollLeft: number) {
    const target = source === "top" ? tableScrollRef.current : topScrollRef.current;
    if (target && Math.abs(target.scrollLeft - scrollLeft) > 1) {
      target.scrollLeft = scrollLeft;
    }
  }

  function focusColumn(departmentId: string) {
    setFocusedColumnId(departmentId);
    const index = columnDepartments.findIndex((department) => department.id === departmentId);
    if (index < 0) return;
    const nextLeft = Math.max(0, stickyColumnWidth + index * matrixColumnWidth - 24);
    tableScrollRef.current?.scrollTo({ left: nextLeft, behavior: "smooth" });
    topScrollRef.current?.scrollTo({ left: nextLeft, behavior: "smooth" });
  }

  return (
    <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_360px]">
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
                  {department ? (
                    <DepartmentLabel department={department} className="mt-1 font-semibold text-ink" />
                  ) : (
                    <div className="mt-1 font-semibold text-ink">Подразделение</div>
                  )}
                  <div className="mt-3 text-3xl font-semibold text-brand">{fixed(summary.average)}</div>
                  <div className="mt-1 text-sm text-muted">Оценок: {summary.count}, 9 и ниже: {summary.lowCount}</div>
                </div>
              );
            })}
        </div>

        <div className="rounded-lg border border-line bg-white shadow-sm">
          <div className="border-b border-line bg-slate-50 px-4 py-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm font-medium text-ink">Прокрутка матрицы</div>
              <div className="text-xs text-muted">Передвигайте полосу, чтобы увидеть отделы справа</div>
            </div>
            <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(220px,1fr)_minmax(220px,300px)_auto]">
              <input
                className="focus-ring rounded-lg border border-line bg-white px-3 py-2 text-sm"
                placeholder="Найти оценивающий отдел"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
              <select
                className="focus-ring rounded-lg border border-line bg-white px-3 py-2 text-sm text-slate-700"
                value={focusedColumnId}
                onChange={(event) => focusColumn(event.target.value)}
              >
                <option value="">Перейти к отделу</option>
                {columnDepartments.map((department) => {
                  const display = getDepartmentDisplayParts(department);
                  return (
                    <option key={department.id} value={department.id}>
                      {display.name}
                    </option>
                  );
                })}
              </select>
              <div className="flex rounded-lg border border-line bg-white p-1">
                {[
                  ["all", "Все"],
                  ["low", "9 и ниже"],
                  ["missing", "Оценки нет"]
                ].map(([value, label]) => (
                  <button
                    className={`focus-ring rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                      viewMode === value ? "bg-graphite text-white" : "text-slate-600 hover:bg-slate-50"
                    }`}
                    key={value}
                    type="button"
                    onClick={() => setViewMode(value as "all" | "low" | "missing")}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div
              ref={topScrollRef}
              className="mt-2 overflow-x-auto pb-1"
              onScroll={(event) => syncHorizontalScroll("top", event.currentTarget.scrollLeft)}
            >
              <div className="h-1" style={{ width: matrixWidth }} />
            </div>
          </div>
          <div
            ref={tableScrollRef}
            className="overflow-x-auto"
            onScroll={(event) => syncHorizontalScroll("table", event.currentTarget.scrollLeft)}
          >
          <table className="border-collapse text-sm" style={{ width: matrixWidth }}>
            <colgroup>
              <col style={{ width: stickyColumnWidth }} />
              {columnDepartments.map((department) => (
                <col key={department.id} style={{ width: matrixColumnWidth }} />
              ))}
              <col style={{ width: averageColumnWidth }} />
            </colgroup>
            <thead>
              <tr className="bg-slate-50 text-xs uppercase tracking-wide text-muted">
                <th className="sticky left-0 z-10 border-b border-line bg-slate-50 px-3 py-2 text-left">
                  Кто оценивает
                </th>
                {columnDepartments.map((department) => {
                  const summary = summaryByDepartment.get(department.id);
                  const display = getDepartmentDisplayParts(department);
                  const isFocused = focusedColumnId === department.id;
                  return (
                    <th
                      className={`border-b border-line px-2 py-2 text-center align-bottom ${isFocused ? "bg-brand/5" : ""}`}
                      key={department.id}
                    >
                      <span className="block truncate font-semibold text-ink" title={display.fullName || display.name}>
                        {display.name}
                      </span>
                      <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${scoreClass(summary?.average)}`}>
                        {fixed(summary?.average)}
                      </span>
                    </th>
                  );
                })}
                <th className="border-b border-line px-2 py-2 text-center">Средняя</th>
              </tr>
            </thead>
            <tbody>
              {visibleRowDepartments.map((evaluator) => {
                const rowScores = columnDepartments
                  .map((evaluatee) => map.get(`${evaluator.id}:${evaluatee.id}`))
                  .filter((evaluation): evaluation is MatrixEvaluation => Boolean(evaluation && !evaluation.noInteraction && evaluation.score != null))
                  .map((evaluation) => evaluation.score as number);
                const rowAverage = rowScores.length ? rowScores.reduce((sum, score) => sum + score, 0) / rowScores.length : null;

                return (
                  <tr key={evaluator.id}>
                    <th className="sticky left-0 z-10 border-b border-line bg-white px-3 py-2 text-left font-medium text-ink">
                      <DepartmentLabel
                        department={evaluator}
                        className="font-medium text-ink"
                        mutedClassName="mt-0.5 max-w-40 truncate text-xs leading-4 text-muted"
                      />
                    </th>
                    {columnDepartments.map((evaluatee) => {
                      const evaluation = map.get(`${evaluator.id}:${evaluatee.id}`);
                      const isSelf = evaluator.id === evaluatee.id;
                      const selectedCell = selected?.id === evaluation?.id;
                      const isFocused = focusedColumnId === evaluatee.id;
                      return (
                        <td className={`border-b border-line p-1.5 text-center ${isFocused ? "bg-brand/5" : ""}`} key={evaluatee.id}>
                          {isSelf ? (
                            <div className="rounded-lg bg-slate-100 px-2 py-2 text-slate-400">—</div>
                          ) : evaluation?.noInteraction ? (
                            <button
                              className={`focus-ring w-full rounded-lg bg-slate-50 px-1.5 py-2 text-[11px] font-semibold leading-4 text-slate-600 ring-1 ring-slate-200 ${selectedCell ? "outline outline-2 outline-brand" : ""}`}
                              type="button"
                              onClick={() => setSelected(evaluation)}
                            >
                              нет взаим.
                            </button>
                          ) : evaluation && isMissingEvaluation(evaluation) ? (
                            <button
                              className={`focus-ring w-full rounded-lg bg-red-50 px-1.5 py-2 text-[11px] font-semibold leading-4 text-red-700 ring-1 ring-red-100 ${selectedCell ? "outline outline-2 outline-brand" : ""}`}
                              type="button"
                              onClick={() => setSelected(evaluation)}
                            >
                              нет оценки
                            </button>
                          ) : evaluation ? (
                            <button
                              className={`focus-ring w-full rounded-lg px-2 py-2 font-semibold ring-1 ${scoreClass(evaluation.score)} ${selectedCell ? "outline outline-2 outline-brand" : ""}`}
                              type="button"
                              onClick={() => setSelected(evaluation)}
                              title={evaluation.comment || undefined}
                            >
                              {evaluation.score}
                            </button>
                          ) : (
                            <button
                              className="focus-ring w-full rounded-lg bg-red-50 px-1.5 py-2 text-[11px] font-semibold leading-4 text-red-700 ring-1 ring-red-100 transition hover:bg-red-100/60"
                              type="button"
                              onClick={() => setSelected(null)}
                            >
                              нет оценки
                            </button>
                          )}
                        </td>
                      );
                    })}
                    <td className="border-b border-line p-1.5 text-center">
                      <span className={`inline-flex min-w-14 justify-center rounded-lg px-2 py-2 font-semibold ring-1 ${scoreClass(rowAverage)}`}>
                        {fixed(rowAverage)}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {!visibleRowDepartments.length ? (
                <tr>
                  <td className="border-b border-line px-4 py-8 text-center text-sm text-muted" colSpan={columnDepartments.length + 2}>
                    По выбранным фильтрам строк не найдено.
                  </td>
                </tr>
              ) : null}
              <tr className="bg-slate-50">
                <th className="sticky left-0 z-10 border-t border-line bg-slate-50 px-3 py-2 text-left font-semibold text-ink">
                  Общая оценка подразделения
                </th>
                {columnDepartments.map((department) => {
                  const summary = summaryByDepartment.get(department.id);
                  return (
                    <td className={`border-t border-line p-1.5 text-center ${focusedColumnId === department.id ? "bg-brand/5" : ""}`} key={department.id}>
                      <span className={`inline-flex min-w-14 justify-center rounded-lg px-2 py-2 font-semibold ring-1 ${scoreClass(summary?.average)}`}>
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
                  {isMissingEvaluation(selected)
                    ? MISSING_EVALUATION_LABEL
                    : selected.noInteraction
                       ? "Нет взаимодействия"
                      : selected.score}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted">Автор</div>
                <div className="mt-1 text-sm text-slate-700">{selected.authorName}</div>
              </div>
              {selected.deviationCategories.length ? (
                <div>
                  <div className="text-sm text-muted">Категории отклонений</div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {selected.deviationCategories.map((category) => (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600" key={category}>
                        {category}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              <div>
                <div className="text-sm text-muted">Комментарий</div>
                <p className="mt-1 text-sm leading-6 text-slate-700">
                  {canViewComments
                    ? isMissingEvaluation(selected)
                      ? MISSING_EVALUATION_LABEL
                      : selected.comment ||
                    (selected.noInteraction
                      ? "Подразделение отметило, что взаимодействия за период не было."
                      : "Комментарий не указан, потому что оценка выше 9.")
                    : "Комментарии доступны руководителю оцениваемого отдела, директору и администратору."}
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
            <h2 className="font-semibold text-ink">Комментарии 9 и ниже</h2>
          </div>
          <div className="mt-4 max-h-[620px] space-y-3 overflow-y-auto pr-1">
            {!canViewComments ? (
              <p className="text-sm leading-6 text-muted">
                Комментарии доступны руководителю оцениваемого отдела, директору и администратору.
              </p>
            ) : visibleLowComments.length ? (
              visibleLowComments.map((item) => (
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
                  {item.deviationCategories.length ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {item.deviationCategories.map((category) => (
                        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-600 ring-1 ring-line" key={category}>
                          {category}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-2 text-xs text-muted">{item.authorName}</div>
                </article>
              ))
            ) : (
              <p className="text-sm leading-6 text-muted">За выбранный период нет оценок 9 и ниже с комментариями.</p>
            )}
          </div>
        </section>
      </aside>
    </div>
  );
}
