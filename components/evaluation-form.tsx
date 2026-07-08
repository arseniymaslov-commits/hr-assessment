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

function blankRow(): RowState {
  return {
    score: 10,
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
  const defaultCriterion =
    criteria.find((criterion) => criterion.name === "Общая оценка взаимодействия") || criteria[0];

  const [periodId, setPeriodId] = useState(openPeriod?.id || "");
  const [evaluatorDepartmentId, setEvaluatorDepartmentId] = useState(defaultEvaluatorId);
  const [criterionId, setCriterionId] = useState(defaultCriterion?.id || "");
  const [rows, setRows] = useState<Record<string, RowState>>({});

  const selectedPeriod = useMemo(
    () => periods.find((period) => period.id === periodId),
    [periodId, periods]
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
            evaluation.criterionId === criterionId &&
            evaluation.evaluateeDepartmentId === department.id
          );
        });
        const currentRow = current[department.id];
        next[department.id] = existing
          ? {
              score: existing.score ?? currentRow?.score ?? 10,
              comment: existing.comment || currentRow?.comment || "",
              noInteraction: existing.noInteraction,
              saving: false,
              message: existing.noInteraction ? "Сохранено: нет взаимодействия" : "Сохранено"
            }
          : currentRow || blankRow();
      }
      return next;
    });
  }, [availableEvaluatees, criterionId, evaluatorDepartmentId, existingEvaluations, isDirector, periodId, user.id]);

  const canUseForm =
    (user.role === "ADMIN" || user.role === "LEADER" || user.role === "DIRECTOR") &&
    selectedPeriod?.status === "OPEN" &&
    criterionId &&
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

  function rowCanSave(row: RowState) {
    if (row.noInteraction) return true;
    return Number.isInteger(row.score) && row.score >= 1 && row.score <= 10 && (row.score === 10 || row.comment.trim().length > 0);
  }

  async function saveDepartment(departmentId: string, noInteraction = false) {
    const row = rows[departmentId] || blankRow();
    if (!canUseForm || (!noInteraction && !rowCanSave(row))) return false;

    updateRow(departmentId, { saving: true, message: "" });
    try {
      const response = await fetch("/api/evaluations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodId,
          evaluatorDepartmentId: isDirector ? "" : evaluatorDepartmentId,
          evaluateeDepartmentId: departmentId,
          criterionId,
          score: row.score,
          comment: row.comment,
          noInteraction
        })
      });
      const data = await response.json().catch(() => ({}));
      updateRow(departmentId, {
        saving: false,
        noInteraction,
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
          Все подразделения показаны списком. Оценка 9 или ниже требует комментарий. ОЦП отмечен как обязательный для оценки.
        </p>
      </div>

      <div className="mb-5 grid gap-4 md:grid-cols-3">
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

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Критерий</span>
          <select className="focus-ring mt-1 w-full rounded-lg border border-line px-3 py-2" value={criterionId} onChange={(event) => setCriterionId(event.target.value)}>
            {criteria.map((criterion) => (
              <option key={criterion.id} value={criterion.id}>{criterion.name}</option>
            ))}
          </select>
        </label>
      </div>

      {selectedPeriod?.status === "CLOSED" ? <div className="mb-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-muted">Период закрыт, редактирование недоступно.</div> : null}

      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Подразделение</th>
              <th className="px-4 py-3">Оценка</th>
              <th className="px-4 py-3">Комментарий</th>
              <th className="px-4 py-3">Действие</th>
              <th className="px-4 py-3">Статус</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {availableEvaluatees.map((department) => {
              const row = rows[department.id] || blankRow();
              const required = requiredEvaluateeIds.has(department.id);
              const commentRequired = !row.noInteraction && row.score < 10;
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
                      onChange={(event) => updateRow(department.id, { score: Number(event.target.value), noInteraction: false, message: "" })}
                    />
                  </td>
                  <td className="px-4 py-4 align-top">
                    {commentRequired ? (
                      <textarea
                        className="focus-ring min-h-20 w-full rounded-lg border border-amber-200 px-3 py-2"
                        disabled={!canUseForm}
                        placeholder="Комментарий обязателен для оценки 9 или ниже"
                        value={row.comment}
                        onChange={(event) => updateRow(department.id, { comment: event.target.value, message: "" })}
                      />
                    ) : (
                      <textarea
                        className="focus-ring min-h-20 w-full rounded-lg border border-line px-3 py-2"
                        disabled={!canUseForm || row.noInteraction}
                        placeholder={row.noInteraction ? "Отмечено: нет взаимодействия" : "Комментарий не обязателен для оценки 10"}
                        value={row.comment}
                        onChange={(event) => updateRow(department.id, { comment: event.target.value, message: "" })}
                      />
                    )}
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
                    {row.saving ? "Сохраняем..." : row.message || (commentRequired ? "Нужен комментарий" : "Готово к сохранению")}
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
