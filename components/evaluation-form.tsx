"use client";

import { useEffect, useMemo, useState } from "react";
import { Ban, Save } from "lucide-react";

type Department = {
  id: string;
  name: string;
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

type UserContext = {
  role: "ADMIN" | "ANALYST" | "LEADER" | "DASHBOARD_VIEWER" | "DIRECTOR" | "VIEWER";
  departmentId?: string | null;
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

export default function EvaluationForm({
  departments,
  periods,
  criteria,
  requirements,
  user
}: {
  departments: Department[];
  periods: Period[];
  criteria: Criterion[];
  requirements: Requirement[];
  user: UserContext;
}) {
  const openPeriod = periods.find((period) => period.status === "OPEN") || periods[0];
  const isDirector = user.role === "DIRECTOR";
  const defaultEvaluatorId = user.role === "LEADER" ? user.departmentId || "" : departments[0]?.id || "";
  const defaultCriterion =
    criteria.find((criterion) => criterion.name === "Общая оценка взаимодействия") || criteria[0];

  const [periodId, setPeriodId] = useState(openPeriod?.id || "");
  const [evaluatorDepartmentId, setEvaluatorDepartmentId] = useState(defaultEvaluatorId);
  const [evaluateeDepartmentId, setEvaluateeDepartmentId] = useState("");
  const [criterionId, setCriterionId] = useState(defaultCriterion?.id || "");
  const [score, setScore] = useState(9);
  const [comment, setComment] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const selectedPeriod = useMemo(
    () => periods.find((period) => period.id === periodId),
    [periodId, periods]
  );
  const availableEvaluatees = useMemo(() => {
    if (isDirector) return departments;

    const requiredIds = requirements
      .filter((requirement) => requirement.evaluatorDepartmentId === evaluatorDepartmentId)
      .map((requirement) => requirement.evaluateeDepartmentId);
    const allowedIds = requiredIds.length ? new Set(requiredIds) : null;

    return departments.filter(
      (department) =>
        department.id !== evaluatorDepartmentId && (!allowedIds || allowedIds.has(department.id))
    );
  }, [departments, evaluatorDepartmentId, isDirector, requirements]);

  useEffect(() => {
    if (!availableEvaluatees.some((department) => department.id === evaluateeDepartmentId)) {
      setEvaluateeDepartmentId(availableEvaluatees[0]?.id || "");
    }
  }, [availableEvaluatees, evaluateeDepartmentId]);

  const requiresComment = score < 9;
  const baseCanSubmit =
    (user.role === "ADMIN" || user.role === "LEADER" || user.role === "DIRECTOR") &&
    selectedPeriod?.status === "OPEN" &&
    (isDirector || evaluatorDepartmentId) &&
    evaluateeDepartmentId &&
    (isDirector || evaluatorDepartmentId !== evaluateeDepartmentId) &&
    criterionId;
  const canSubmitScore =
    baseCanSubmit &&
    Number.isInteger(score) &&
    score >= 1 &&
    score <= 10 &&
    (!requiresComment || comment.trim().length > 0);

  async function save(noInteraction: boolean) {
    setSaving(true);
    setMessage("");

    const response = await fetch("/api/evaluations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        periodId,
        evaluatorDepartmentId: isDirector ? "" : evaluatorDepartmentId,
        evaluateeDepartmentId,
        criterionId,
        score,
        comment,
        noInteraction
      })
    });

    const data = await response.json().catch(() => ({}));
    setSaving(false);

    if (response.ok) {
      setMessage(noInteraction ? "Отметка «Нет взаимодействия» сохранена." : "Оценка сохранена.");
      if (noInteraction || score >= 9) setComment("");
      return;
    }

    setMessage(data.error || "Не удалось сохранить оценку.");
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    save(false);
  }

  return (
    <form className="rounded-lg border border-line bg-white p-5" onSubmit={submit}>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
            <div className="mt-1 rounded-lg border border-line bg-slate-100 px-3 py-2 text-slate-700">
              Директор
            </div>
          ) : (
            <select className="focus-ring mt-1 w-full rounded-lg border border-line px-3 py-2 disabled:bg-slate-100" value={evaluatorDepartmentId} onChange={(event) => setEvaluatorDepartmentId(event.target.value)} disabled={user.role === "LEADER"}>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>{department.name}</option>
              ))}
            </select>
          )}
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Кого оценивают</span>
          <select className="focus-ring mt-1 w-full rounded-lg border border-line px-3 py-2" value={evaluateeDepartmentId} onChange={(event) => setEvaluateeDepartmentId(event.target.value)}>
            {availableEvaluatees.map((department) => (
              <option key={department.id} value={department.id}>{department.name}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Критерий</span>
          <select className="focus-ring mt-1 w-full rounded-lg border border-line px-3 py-2" value={criterionId} onChange={(event) => setCriterionId(event.target.value)}>
            {criteria.map((criterion) => (
              <option key={criterion.id} value={criterion.id}>{criterion.name}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-slate-700">Оценка от 1 до 10</span>
          <input className="focus-ring mt-1 w-full rounded-lg border border-line px-3 py-2" type="number" min={1} max={10} value={score} onChange={(event) => setScore(Number(event.target.value))} />
        </label>

        <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
          <div className="font-medium">Правило контроля</div>
          <div className="mt-1">Ниже 9 нужен комментарий. Если взаимодействия не было, нажмите отдельную кнопку.</div>
        </div>
      </div>

      <label className="mt-4 block">
        <span className="text-sm font-medium text-slate-700">
          Комментарий {requiresComment ? <span className="text-risk">*</span> : null}
        </span>
        <textarea className="focus-ring mt-1 min-h-28 w-full rounded-lg border border-line px-3 py-2" value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Опишите причину низкой оценки или важный контекст" required={requiresComment} />
      </label>

      {message ? <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{message}</div> : null}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button className="focus-ring inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2.5 font-semibold text-white disabled:opacity-50" disabled={!canSubmitScore || saving} type="submit">
          <Save size={18} /> {saving ? "Сохраняем..." : "Сохранить оценку"}
        </button>
        <button className="focus-ring inline-flex items-center gap-2 rounded-lg border border-line bg-white px-4 py-2.5 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50" disabled={!baseCanSubmit || saving} type="button" onClick={() => save(true)}>
          <Ban size={18} /> Нет взаимодействия
        </button>
        {selectedPeriod?.status === "CLOSED" ? <span className="text-sm text-muted">Период закрыт, редактирование недоступно.</span> : null}
        {!availableEvaluatees.length ? <span className="text-sm text-muted">Нет доступных подразделений для оценки.</span> : null}
      </div>
    </form>
  );
}
