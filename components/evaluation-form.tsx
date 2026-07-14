"use client";

import { useEffect, useMemo, useState } from "react";
import { Ban, Save } from "lucide-react";
import DepartmentLabel from "@/components/department-label";
import { departmentOptionLabel } from "@/lib/department-decodings";

type Department = {
  id: string;
  name: string;
  shortName?: string | null;
};

type Period = {
  id: string;
  month: number;
  year: number;
  status: "OPEN" | "CLOSED";
};

type Criterion = {
  id: string;
  name: string;
  description?: string | null;
};

type Requirement = {
  evaluatorDepartmentId: string;
  evaluateeDepartmentId: string;
};

type ExistingEvaluation = {
  periodId: string;
  criterionId: string;
  evaluatorDepartmentId?: string | null;
  evaluatorUserId?: string | null;
  evaluateeDepartmentId: string;
  score?: number | null;
  comment?: string | null;
  deviationCategories?: string[];
  noInteraction: boolean;
};

type UserContext = {
  id: string;
  role: "ADMIN" | "ANALYST" | "LEADER" | "DASHBOARD_VIEWER" | "DIRECTOR" | "VIEWER";
  departmentId?: string | null;
  departmentName?: string | null;
  departmentFullName?: string | null;
};

type RowState = {
  score: number;
  deviationCategories: string[];
  comment: string;
  noInteraction: boolean;
  saving: boolean;
  message: string;
};

const monthNames = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь"
];

const OVERALL_CRITERION_NAME = "Общая оценка взаимодействия";

const DEVIATION_CATEGORIES = [
  "Нарушение сроков исполнения",
  "Несвоевременная или неполная обратная связь",
  "Неполные или некорректные данные и документы",
  "Недостаточная координация действий",
  "Некорректная деловая коммуникация",
  "Несоответствие результата требованиям",
  "Неисполнение обязательного требования или поручения",
  "Иное"
];

const SCORE_GUIDE = [
  [10, "Результат полностью соответствует требованиям, принят с первого раза и может использоваться без исправлений."],
  [9, "Единичное незначительное отклонение без влияния на дальнейшую работу."],
  [8, "Потребовалась незначительная корректировка или уточнение без влияния на сроки."],
  [7, "Несколько незначительных отклонений либо уточнение существенных элементов, результат пригоден."],
  [6, "Существенная доработка, повторное предоставление части результата или неполное обязательное требование."],
  [5, "Нарушение повлияло на срок следующего этапа, но не остановило процесс."],
  [4, "Значительная задержка, существенная повторная работа или ограничение использования результата."],
  [3, "Результат частично пригоден, процесс невозможен до устранения нарушения или временно приостановлен."],
  [2, "Результат практически непригоден и требует полного повторного выполнения."],
  [1, "Результат не предоставлен, обязательство не исполнено или допущено критическое нарушение."]
] as const;

function blankRow(): RowState {
  return {
    score: 10,
    deviationCategories: [],
    comment: "",
    noInteraction: false,
    saving: false,
    message: ""
  };
}

export default function EvaluationForm({
  departments,
  evaluateeDepartments,
  periods,
  criteria,
  requirements,
  existingEvaluations,
  user
}: {
  departments: Department[];
  evaluateeDepartments: Department[];
  periods: Period[];
  criteria: Criterion[];
  requirements: Requirement[];
  existingEvaluations: ExistingEvaluation[];
  user: UserContext;
}) {
  const openPeriod = periods.find((period) => period.status === "OPEN") || periods[0];
  const isDirector = user.role === "DIRECTOR";
  const defaultEvaluatorId = user.role === "LEADER" ? user.departmentId || "" : departments[0]?.id || "";

  const [periodId, setPeriodId] = useState(openPeriod?.id || "");
  const [evaluatorDepartmentId, setEvaluatorDepartmentId] = useState(defaultEvaluatorId);
  const [rows, setRows] = useState<Record<string, RowState>>({});

  const selectedPeriod = useMemo(
    () => periods.find((period) => period.id === periodId),
    [periodId, periods]
  );
  const overallCriterion = useMemo(
    () => criteria.find((criterion) => criterion.name === OVERALL_CRITERION_NAME) || criteria[0],
    [criteria]
  );
  const availableEvaluatees = useMemo(
    () =>
      evaluateeDepartments.filter(
        (department) => isDirector || department.id !== evaluatorDepartmentId
      ),
    [evaluateeDepartments, evaluatorDepartmentId, isDirector]
  );
  const requiredEvaluateeIds = useMemo(() => {
    const ids = new Set(
      requirements
        .filter((requirement) => requirement.evaluatorDepartmentId === evaluatorDepartmentId)
        .map((requirement) => requirement.evaluateeDepartmentId)
    );
    const ocp = evaluateeDepartments.find((department) => department.name === "ОЦП");
    if (ocp) ids.add(ocp.id);
    return ids;
  }, [evaluateeDepartments, evaluatorDepartmentId, requirements]);

  useEffect(() => {
    setRows((current) => {
      const next: Record<string, RowState> = {};
      for (const department of availableEvaluatees) {
        const existing = existingEvaluations.find((evaluation) => {
          const sameEvaluator = isDirector
            ? evaluation.evaluatorUserId === user.id
            : evaluation.evaluatorDepartmentId === evaluatorDepartmentId;
          return (
            sameEvaluator &&
            evaluation.periodId === periodId &&
            evaluation.criterionId === overallCriterion?.id &&
            evaluation.evaluateeDepartmentId === department.id
          );
        });
        const currentRow = current[department.id];
        next[department.id] = existing
          ? {
              score: existing.score ?? currentRow?.score ?? 10,
              deviationCategories: existing.deviationCategories || currentRow?.deviationCategories || [],
              comment: existing.comment || currentRow?.comment || "",
              noInteraction: existing.noInteraction,
              saving: false,
              message: existing.noInteraction ? "Сохранено: нет взаимодействия" : "Сохранено"
            }
          : currentRow || blankRow();
      }
      return next;
    });
  }, [availableEvaluatees, evaluatorDepartmentId, existingEvaluations, isDirector, overallCriterion?.id, periodId, user.id]);

  const canUseForm =
    (user.role === "ADMIN" || user.role === "LEADER" || user.role === "DIRECTOR") &&
    selectedPeriod?.status === "OPEN" &&
    overallCriterion &&
    (isDirector || evaluatorDepartmentId);

  function updateRow(departmentId: string, patch: Partial<RowState>) {
    setRows((current) => ({
      ...current,
      [departmentId]: {
        ...(current[departmentId] || blankRow()),
        ...patch
      }
    }));
  }

  function toggleCategory(row: RowState, category: string) {
    return row.deviationCategories.includes(category)
      ? row.deviationCategories.filter((item) => item !== category)
      : [...row.deviationCategories, category];
  }

  function rowCanSave(row: RowState) {
    if (row.noInteraction) return true;
    const validScore = Number.isInteger(row.score) && row.score >= 1 && row.score <= 10;
    if (!validScore) return false;
    if (row.score === 10) return true;
    return row.comment.trim().length > 0 && row.deviationCategories.length > 0;
  }

  async function saveDepartment(departmentId: string, noInteraction = false) {
    const row = rows[departmentId] || blankRow();
    if (!canUseForm || !overallCriterion || (!noInteraction && !rowCanSave(row))) return false;

    updateRow(departmentId, { saving: true, message: "" });
    try {
      const response = await fetch("/api/evaluations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodId,
          evaluatorDepartmentId: isDirector ? "" : evaluatorDepartmentId,
          evaluateeDepartmentId: departmentId,
          criterionId: overallCriterion.id,
          score: row.score,
          comment: row.comment,
          deviationCategories: noInteraction ? [] : row.deviationCategories,
          noInteraction
        })
      });
      const data = await response.json().catch(() => ({}));
      updateRow(departmentId, {
        saving: false,
        noInteraction,
        deviationCategories: noInteraction ? [] : row.deviationCategories,
        comment: noInteraction ? "" : row.comment,
        message: response.ok
          ? noInteraction
            ? "Сохранено: нет взаимодействия"
            : "Оценка сохранена"
          : data.error || "Не удалось сохранить"
      });
      return response.ok;
    } catch {
      updateRow(departmentId, {
        saving: false,
        message: "Ошибка соединения. Эта строка не сохранена"
      });
      return false;
    }
  }

  return (
    <section className="rounded-lg border border-line bg-white p-5 shadow-sm">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-ink">Поставить оценки подразделениям</h2>
        <p className="mt-1 text-sm text-muted">
          Выставьте одну общую оценку от 1 до 10. Если оценка ниже 10, выберите категорию отклонения и укажите подтверждающий комментарий.
        </p>
      </div>

      <div className="mb-5 grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Период оценки</span>
          <select className="focus-ring mt-1 w-full rounded-lg border border-line px-3 py-2" value={periodId} onChange={(event) => setPeriodId(event.target.value)}>
            {periods.map((period) => (
              <option key={period.id} value={period.id}>
                {monthNames[period.month - 1]} {period.year} · {period.status === "OPEN" ? "открыт" : "закрыт"}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Кто оценивает</span>
          {isDirector ? (
            <div className="mt-1 rounded-lg border border-line bg-slate-100 px-3 py-2 text-slate-700">Директор</div>
          ) : user.role === "LEADER" ? (
            <div className="mt-1 rounded-lg border border-line bg-slate-100 px-3 py-2 font-medium text-slate-700">
              {user.departmentName || departments.find((department) => department.id === evaluatorDepartmentId)?.name || "Ваш отдел"}
              {user.departmentFullName ? <div className="mt-1 text-xs font-normal text-muted">{user.departmentFullName}</div> : null}
            </div>
          ) : (
            <select className="focus-ring mt-1 w-full rounded-lg border border-line px-3 py-2" value={evaluatorDepartmentId} onChange={(event) => setEvaluatorDepartmentId(event.target.value)}>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>{departmentOptionLabel(department)}</option>
              ))}
            </select>
          )}
        </label>
      </div>

      <details className="mb-4 rounded-lg border border-line bg-slate-50 px-4 py-3 text-sm text-slate-700">
        <summary className="cursor-pointer font-semibold text-ink">Шкала оценки 1-10</summary>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {SCORE_GUIDE.map(([score, description]) => (
            <div className="rounded-lg bg-white p-3 ring-1 ring-line" key={score}>
              <div className="font-semibold text-ink">{score} баллов</div>
              <div className="mt-1 text-xs leading-5 text-muted">{description}</div>
            </div>
          ))}
        </div>
      </details>

      {selectedPeriod?.status === "CLOSED" ? <div className="mb-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-muted">Период закрыт, редактирование недоступно.</div> : null}

      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[1080px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Подразделение</th>
              <th className="px-4 py-3">Оценка</th>
              <th className="px-4 py-3">Категории отклонений</th>
              <th className="px-4 py-3">Комментарий</th>
              <th className="px-4 py-3">Действие</th>
              <th className="px-4 py-3">Статус</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {availableEvaluatees.map((department) => {
              const row = rows[department.id] || blankRow();
              const required = requiredEvaluateeIds.has(department.id);
              const needsDetails = !row.noInteraction && row.score < 10;
              return (
                <tr className={required ? "bg-slate-50" : ""} key={department.id}>
                  <td className="px-4 py-4 align-top">
                    <DepartmentLabel department={department} className="font-semibold text-ink" />
                    {required ? <div className="mt-1 text-xs font-semibold text-brandDark">Обязательно оценить</div> : null}
                  </td>
                  <td className="px-4 py-4 align-top">
                    <input
                      className="focus-ring w-24 rounded-lg border border-line px-3 py-2 text-lg font-semibold"
                      disabled={row.noInteraction || !canUseForm}
                      max={10}
                      min={1}
                      type="number"
                      value={row.score}
                      onChange={(event) => {
                        const score = Number(event.target.value);
                        updateRow(department.id, {
                          score,
                          deviationCategories: score === 10 ? [] : row.deviationCategories,
                          noInteraction: false,
                          message: ""
                        });
                      }}
                    />
                  </td>
                  <td className="px-4 py-4 align-top">
                    {needsDetails ? (
                      <div className="grid min-w-[280px] gap-2">
                        {DEVIATION_CATEGORIES.map((category) => (
                          <label className="flex items-start gap-2 rounded-lg border border-line bg-white p-2 text-xs font-medium text-slate-700" key={category}>
                            <input
                              className="mt-0.5"
                              checked={row.deviationCategories.includes(category)}
                              disabled={!canUseForm}
                              type="checkbox"
                              onChange={() =>
                                updateRow(department.id, {
                                  deviationCategories: toggleCategory(row, category),
                                  message: ""
                                })
                              }
                            />
                            <span>{category}</span>
                          </label>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-muted">Для оценки 10 категории не требуются</div>
                    )}
                  </td>
                  <td className="px-4 py-4 align-top">
                    <textarea
                      className={`focus-ring min-h-24 w-full rounded-lg border px-3 py-2 ${needsDetails ? "border-amber-200" : "border-line"}`}
                      disabled={!canUseForm || row.noInteraction}
                      placeholder={
                        row.noInteraction
                          ? "Отмечено: нет взаимодействия"
                          : needsDetails
                            ? "Укажите факт, нарушенное требование, последствия и источник подтверждения"
                            : "Комментарий не обязателен для оценки 10"
                      }
                      value={row.comment}
                      onChange={(event) => updateRow(department.id, { comment: event.target.value, message: "" })}
                    />
                  </td>
                  <td className="px-4 py-4 align-top">
                    <div className="flex flex-col gap-2">
                      <button
                        className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg border border-brand/30 bg-white px-3 py-2 font-semibold text-brand transition hover:bg-brand/5 disabled:opacity-50"
                        disabled={!canUseForm || row.saving || !rowCanSave(row)}
                        type="button"
                        onClick={() => saveDepartment(department.id)}
                      >
                        <Save size={16} /> Сохранить
                      </button>
                      <button
                        className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-white px-3 py-2 font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
                        disabled={!canUseForm || row.saving}
                        type="button"
                        onClick={() => saveDepartment(department.id, true)}
                      >
                        <Ban size={16} /> Нет взаимодействия
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-4 align-top text-slate-700">
                    {row.saving
                      ? "Сохраняем..."
                      : row.message ||
                        (needsDetails
                          ? "Нужны категория и комментарий"
                          : "Готово к сохранению")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
