"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Ban, Save } from "lucide-react";
import DepartmentLabel from "@/components/department-label";
import { departmentOptionLabel } from "@/lib/department-decodings";
import { DEVIATION_CATEGORIES } from "@/lib/evaluation-categories";

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
  assessmentDate?: string | null;
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

function formatDateLabel(value?: string | null) {
  const date = value ? new Date(value) : new Date();
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(date);
}

function assessedPeriodLabel(period?: Period) {
  if (!period) return "активный период";
  const assessedDate = new Date(period.year, period.month - 2, 1);
  const month = new Intl.DateTimeFormat("ru-RU", { month: "long" }).format(assessedDate);
  return `${month} ${assessedDate.getFullYear()}`;
}

function statusTone(row: RowState, needsDetails: boolean) {
  if (row.saving) return "border-amber-100 bg-amber-50 text-amber-800";
  if (row.noInteraction) return "border-slate-200 bg-slate-100 text-slate-600";
  if (row.message.includes("Ошибка") || row.message.includes("Не удалось")) {
    return "border-red-100 bg-red-50 text-red-700";
  }
  if (row.message.includes("Сохранено") || row.message.includes("сохранена")) {
    return "border-emerald-100 bg-emerald-50 text-emerald-700";
  }
  if (needsDetails) return "border-amber-100 bg-amber-50 text-amber-800";
  return "border-slate-200 bg-slate-50 text-slate-600";
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
  const canSelectPeriod = user.role === "ADMIN";
  const defaultEvaluatorId = user.role === "LEADER" ? user.departmentId || "" : departments[0]?.id || "";

  const [periodId, setPeriodId] = useState(openPeriod?.id || "");
  const [evaluatorDepartmentId, setEvaluatorDepartmentId] = useState(defaultEvaluatorId);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const savedSignatures = useRef<Record<string, string>>({});

  const selectedPeriod = useMemo(
    () => periods.find((period) => period.id === periodId),
    [periodId, periods]
  );
  const assessmentDate = formatDateLabel(selectedPeriod?.assessmentDate);
  const assessedPeriod = assessedPeriodLabel(selectedPeriod);
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

  function rowSignature(departmentId: string, row: RowState, noInteraction = row.noInteraction) {
    return JSON.stringify({
      periodId,
      evaluatorDepartmentId: isDirector ? null : evaluatorDepartmentId,
      evaluatorUserId: isDirector ? user.id : null,
      evaluateeDepartmentId: departmentId,
      criterionId: overallCriterion?.id || "",
      score: noInteraction ? null : row.score,
      comment: noInteraction ? "" : row.comment.trim(),
      deviationCategories: noInteraction || row.score === 10 ? [] : row.deviationCategories.slice().sort(),
      noInteraction
    });
  }

  const canUseForm =
    (user.role === "ADMIN" || user.role === "LEADER" || user.role === "DIRECTOR") &&
    selectedPeriod?.status === "OPEN" &&
    overallCriterion &&
    (isDirector || evaluatorDepartmentId);

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
        savedSignatures.current[department.id] = rowSignature(department.id, next[department.id]);
      }
      return next;
    });
  }, [availableEvaluatees, evaluatorDepartmentId, existingEvaluations, isDirector, overallCriterion?.id, periodId, user.id]);

  useEffect(() => {
    if (!canUseForm || !overallCriterion) return;

    for (const department of availableEvaluatees) {
      const row = rows[department.id];
      if (!row || row.saving || row.noInteraction || !rowCanSave(row)) continue;

      const signature = rowSignature(department.id, row, false);
      if (signature === savedSignatures.current[department.id]) continue;

      if (saveTimers.current[department.id]) clearTimeout(saveTimers.current[department.id]);
      saveTimers.current[department.id] = setTimeout(() => {
        saveDepartment(department.id, false, row, signature);
      }, 900);
    }

    return () => {
      for (const timer of Object.values(saveTimers.current)) clearTimeout(timer);
    };
  }, [rows, canUseForm, overallCriterion?.id, periodId, evaluatorDepartmentId, isDirector, user.id, availableEvaluatees]);

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

  async function saveDepartment(
    departmentId: string,
    noInteraction = false,
    rowOverride?: RowState,
    signatureOverride?: string
  ) {
    const row = rowOverride || rows[departmentId] || blankRow();
    if (!canUseForm || !overallCriterion || (!noInteraction && !rowCanSave(row))) return false;

    if (saveTimers.current[departmentId]) clearTimeout(saveTimers.current[departmentId]);
    const sentSignature = signatureOverride || rowSignature(departmentId, row, noInteraction);

    updateRow(departmentId, { saving: true, message: "Сохраняем..." });
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
      if (response.ok) {
        savedSignatures.current[departmentId] = sentSignature;
      }
      updateRow(departmentId, {
        saving: false,
        noInteraction,
        deviationCategories: noInteraction ? [] : row.deviationCategories,
        comment: noInteraction ? "" : row.comment,
        message: response.ok
          ? noInteraction
            ? "Сохранено: нет взаимодействия"
            : "Сохранено"
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

      <div className="mb-5 rounded-lg border border-line bg-slate-50 px-4 py-3">
        <div className="grid gap-3 md:grid-cols-[minmax(180px,0.7fr)_1fr] md:items-center">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">Дата оценки</div>
            <div className="mt-1 text-lg font-semibold text-ink">{assessmentDate}</div>
          </div>
          <div className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-slate-700 ring-1 ring-line">
            Оценивается взаимодействие за {assessedPeriod}
          </div>
        </div>
      </div>

      <div className={`mb-5 grid gap-4 ${canSelectPeriod ? "md:grid-cols-2" : ""}`}>
        {canSelectPeriod ? (
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
        ) : null}

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

      <div className="space-y-3">
        {availableEvaluatees.map((department) => {
          const row = rows[department.id] || blankRow();
          const required = requiredEvaluateeIds.has(department.id);
          const needsDetails = !row.noInteraction && row.score < 10;
          const statusText = row.saving
            ? "Сохраняем..."
            : row.message ||
              (needsDetails ? "Нужны категория и комментарий" : "Готово к сохранению");

          return (
            <article
              className={`rounded-lg border bg-white p-4 transition ${
                required ? "border-brand/20 bg-brand/5" : "border-line"
              }`}
              key={department.id}
            >
              <div className="grid gap-4 lg:grid-cols-[minmax(220px,1fr)_120px_minmax(260px,1.2fr)_190px] lg:items-start">
                <div>
                  <DepartmentLabel department={department} className="font-semibold text-ink" />
                  <div className="mt-2 flex flex-wrap gap-2">
                    {required ? (
                      <span className="rounded-full bg-brand/10 px-2.5 py-1 text-xs font-semibold text-brand">
                        Обязательно
                      </span>
                    ) : null}
                    {row.noInteraction ? (
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                        Нет взаимодействия
                      </span>
                    ) : null}
                  </div>
                </div>

                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  <span>Оценка</span>
                  <select
                    className="focus-ring rounded-lg border border-line bg-white px-3 py-2 text-lg font-semibold text-ink"
                    disabled={row.noInteraction || !canUseForm}
                    value={row.score}
                    onChange={(event) => {
                      const score = Number(event.target.value);
                      updateRow(department.id, {
                        score,
                        deviationCategories: score === 10 ? [] : row.deviationCategories,
                        noInteraction: false,
                          message: rowCanSave({ ...row, score, deviationCategories: score === 10 ? [] : row.deviationCategories, noInteraction: false })
                            ? "Ожидание автосохранения..."
                            : ""
                        });
                    }}
                  >
                    {SCORE_GUIDE.map(([score]) => (
                      <option key={score} value={score}>
                        {score}
                      </option>
                    ))}
                  </select>
                </label>

                <div>
                  <div className="text-sm font-medium text-slate-700">Комментарий</div>
                  <textarea
                    className={`focus-ring mt-1 min-h-24 w-full rounded-lg border px-3 py-2 text-sm ${
                      needsDetails ? "border-amber-200" : "border-line"
                    }`}
                    disabled={!canUseForm || row.noInteraction}
                    placeholder={
                      row.noInteraction
                        ? "Отмечено: нет взаимодействия"
                        : needsDetails
                          ? "Кратко укажите факт и последствия"
                          : "Комментарий не обязателен для оценки 10"
                    }
                    value={row.comment}
                    onChange={(event) =>
                      updateRow(department.id, {
                        comment: event.target.value,
                        message: needsDetails ? "Ожидание автосохранения..." : "Ожидание автосохранения..."
                      })
                    }
                  />
                </div>

                <div className="grid gap-2">
                  <div className={`rounded-lg border px-3 py-2 text-xs font-medium leading-5 ${statusTone(row, needsDetails)}`}>
                    {statusText}
                  </div>
                  <button
                    className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg border border-brand/30 bg-white px-2.5 py-1.5 text-xs font-semibold text-brand transition hover:bg-brand/5 disabled:opacity-50"
                    disabled={!canUseForm || row.saving || !rowCanSave(row)}
                    type="button"
                    onClick={() => saveDepartment(department.id)}
                  >
                    <Save size={14} /> Сохранить сейчас
                  </button>
                  <button
                    className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
                    disabled={!canUseForm || row.saving}
                    type="button"
                    onClick={() => saveDepartment(department.id, true)}
                  >
                    <Ban size={14} /> Нет взаимодействия
                  </button>
                  {row.noInteraction ? (
                    <button
                      className="focus-ring rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                      disabled={!canUseForm || row.saving}
                      type="button"
                      onClick={() =>
                        updateRow(department.id, {
                          noInteraction: false,
                          score: 10,
                          comment: "",
                          deviationCategories: [],
                          message: "Ожидание автосохранения..."
                        })
                      }
                    >
                      Поставить оценку
                    </button>
                  ) : null}
                </div>
              </div>

              {needsDetails ? (
                <details className="mt-4 rounded-lg border border-amber-100 bg-amber-50/40">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold text-ink">
                    <span>Категории отклонений</span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-600 ring-1 ring-amber-100">
                      выбрано: {row.deviationCategories.length}
                    </span>
                  </summary>
                  {row.deviationCategories.length ? (
                    <div className="flex flex-wrap gap-1 px-3 pb-2">
                      {row.deviationCategories.map((category) => (
                        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-600 ring-1 ring-line" key={category}>
                          {category}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div className="grid gap-2 border-t border-amber-100 p-3 sm:grid-cols-2 xl:grid-cols-4">
                    {DEVIATION_CATEGORIES.map((category) => (
                      <label
                        className="flex items-start gap-2 rounded-lg border border-line bg-white p-2 text-xs font-medium text-slate-700"
                        key={category}
                      >
                        <input
                          className="mt-0.5"
                          checked={row.deviationCategories.includes(category)}
                          disabled={!canUseForm}
                          type="checkbox"
                          onChange={() =>
                            updateRow(department.id, {
                              deviationCategories: toggleCategory(row, category),
                              message: "Ожидание автосохранения..."
                            })
                          }
                        />
                        <span>{category}</span>
                      </label>
                    ))}
                  </div>
                </details>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
