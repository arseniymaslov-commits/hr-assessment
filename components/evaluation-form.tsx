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
  scores: Record<string, number>;
  comment: string;
  noInteraction: boolean;
  saving: boolean;
  message: string;
};

type CriterionDefinition = {
  id: string;
  name: string;
  shortName: string;
  description?: string | null;
};

type CriterionTemplate = {
  name: string;
  shortName: string;
  description: string;
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
    scores: {},
    comment: "",
    noInteraction: false,
    saving: false,
    message: ""
  };
}

const OVERALL_CRITERION_NAME = "Общая оценка взаимодействия";

const COMMON_CRITERIA: CriterionTemplate[] = [
  {
    name: "Сроки исполнения и обратной связи",
    shortName: "Сроки",
    description:
      "Соблюдение сроков по запросам, письмам, заявкам, согласованиям, поручениям и предоставлению обратной связи."
  },
  {
    name: "Качество предоставленных данных и документов",
    shortName: "Данные",
    description:
      "Полнота, корректность и достоверность предоставленных данных, документов, таблиц, отчётов и пояснений."
  },
  {
    name: "Качество рабочего взаимодействия",
    shortName: "Взаимодействие",
    description:
      "Исполнение совместных задач без необоснованных задержек, повторных запросов, формального подхода и некорректной коммуникации."
  }
] as const;

const SPECIAL_CRITERIA_BY_EVALUATOR: Record<string, CriterionTemplate[]> = {
  СВКА: [
    {
      name: "Исполнение аудиторских рекомендаций",
      shortName: "Аудит",
      description: "Своевременность и качество исполнения рекомендаций по итогам аудиторских проверок."
    },
    {
      name: "Взаимодействие при проверках",
      shortName: "Проверки",
      description: "Своевременность предоставления документов, пояснений и данных по запросам СВКА."
    }
  ],
  УЧР: [
    {
      name: "Трудовая дисциплина",
      shortName: "Дисциплина",
      description:
        "Опоздания, отсутствия, нарушения графика работы, некорректная регистрация в СКУД, неоформленные рабочие выезды и несвоевременное информирование УЧР."
    },
    {
      name: "Кадровое и административное делопроизводство",
      shortName: "Кадры",
      description:
        "Своевременность и корректность оформления приёма, увольнения, отпусков, табелей, КПЭ, актов передачи дел и иных кадровых документов."
    },
    {
      name: "Оценка, обучение и кадровая работа",
      shortName: "Развитие",
      description:
        "Участие сотрудников в оценке, обучении, срезах знаний, формировании кадрового резерва, а также взаимодействие при подборе и предоставление обратной связи."
    }
  ]
};

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

  const availableEvaluatees = useMemo(
    () =>
      evaluateeDepartments.filter(
        (department) => isDirector || department.id !== evaluatorDepartmentId
      ),
    [evaluateeDepartments, evaluatorDepartmentId, isDirector]
  );

  const evaluatorDepartment = useMemo(
    () => departments.find((department) => department.id === evaluatorDepartmentId),
    [departments, evaluatorDepartmentId]
  );
  const overallCriterion = useMemo(
    () => criteria.find((criterion) => criterion.name === OVERALL_CRITERION_NAME) || criteria[0],
    [criteria]
  );
  const activeCriteria = useMemo<CriterionDefinition[]>(() => {
    const templates = [
      ...COMMON_CRITERIA,
      ...(evaluatorDepartment?.name ? SPECIAL_CRITERIA_BY_EVALUATOR[evaluatorDepartment.name] || [] : [])
    ];

    return templates.reduce<CriterionDefinition[]>((acc, template) => {
        const criterion = criteria.find((item) => item.name === template.name);
        if (!criterion) return acc;
        acc.push({
          id: criterion.id,
          name: criterion.name,
          shortName: template.shortName,
          description: criterion.description || template.description
        });
        return acc;
      }, []);
  }, [criteria, evaluatorDepartment?.name]);

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
        const matchingEvaluations = existingEvaluations.filter((evaluation) => {
          const sameEvaluator = isDirector
            ? evaluation.evaluatorUserId === user.id
            : evaluation.evaluatorDepartmentId === evaluatorDepartmentId;
          return (
            sameEvaluator &&
            evaluation.periodId === periodId &&
            evaluation.evaluateeDepartmentId === department.id
          );
        });
        const existingOverall = matchingEvaluations.find(
          (evaluation) => evaluation.criterionId === overallCriterion?.id
        );
        const existingComment = matchingEvaluations.find((evaluation) => evaluation.comment)?.comment || "";
        const existingNoInteraction = Boolean(existingOverall?.noInteraction);
        const currentRow = current[department.id];
        next[department.id] = matchingEvaluations.length
          ? {
              scores: {
                ...Object.fromEntries(activeCriteria.map((criterion) => [criterion.id, 10])),
                ...(currentRow?.scores || {}),
                ...Object.fromEntries(
                  activeCriteria.map((criterion) => {
                    const criterionEvaluation = matchingEvaluations.find(
                      (evaluation) => evaluation.criterionId === criterion.id
                    );
                    return [criterion.id, criterionEvaluation?.score ?? existingOverall?.score ?? 10];
                  })
                )
              },
              comment: existingComment || currentRow?.comment || "",
              noInteraction: existingNoInteraction,
              saving: false,
              message: existingNoInteraction ? "Сохранено: нет взаимодействия" : "Сохранено"
            }
          : {
              ...blankRow(),
              ...(currentRow || {}),
              scores: {
                ...Object.fromEntries(activeCriteria.map((criterion) => [criterion.id, 10])),
                ...(currentRow?.scores || {})
              }
            };
      }
      return next;
    });
  }, [activeCriteria, availableEvaluatees, evaluatorDepartmentId, existingEvaluations, isDirector, overallCriterion?.id, periodId, user.id]);

  const canUseForm =
    (user.role === "ADMIN" || user.role === "LEADER" || user.role === "DIRECTOR") &&
    selectedPeriod?.status === "OPEN" &&
    overallCriterion &&
    activeCriteria.length > 0 &&
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
    const scores = activeCriteria.map((criterion) => Number(row.scores[criterion.id] ?? 10));
    return (
      scores.every((score) => Number.isInteger(score) && score >= 1 && score <= 10) &&
      (scores.every((score) => score > 9) || row.comment.trim().length > 0)
    );
  }

  async function saveDepartment(departmentId: string, noInteraction = false) {
    const row = rows[departmentId] || blankRow();
    if (!canUseForm || !overallCriterion || (!noInteraction && !rowCanSave(row))) return false;

    updateRow(departmentId, { saving: true, message: "" });
    try {
      const criteriaToSave = noInteraction ? [overallCriterion, ...activeCriteria] : activeCriteria;
      const detailScores = activeCriteria.map((criterion) => Number(row.scores[criterion.id] ?? 10));
      const averageScore = Math.round(
        detailScores.reduce((sum, score) => sum + score, 0) / Math.max(detailScores.length, 1)
      );
      const payloads = [
        ...criteriaToSave.map((criterion) => ({
          criterionId: criterion.id,
          score: noInteraction ? 10 : Number(row.scores[criterion.id] ?? averageScore)
        })),
        ...(noInteraction
          ? []
          : [
              {
                criterionId: overallCriterion.id,
                score: averageScore
              }
            ])
      ];

      let firstError = "";
      for (const payload of payloads) {
        const response = await fetch("/api/evaluations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            periodId,
            evaluatorDepartmentId: isDirector ? "" : evaluatorDepartmentId,
            evaluateeDepartmentId: departmentId,
            criterionId: payload.criterionId,
            score: payload.score,
            comment: row.comment,
            noInteraction
          })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          firstError = data.error || "Не удалось сохранить";
          break;
        }
      }
      updateRow(departmentId, {
        saving: false,
        noInteraction,
        comment: noInteraction ? "" : row.comment,
        message: !firstError
          ? noInteraction
            ? "Сохранено: нет взаимодействия"
            : "Оценка сохранена"
          : firstError
      });
      return !firstError;
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
          Оцените подразделения по критериям. Если хотя бы один критерий 9 или ниже, комментарий обязателен.
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

      <div className="mb-4 rounded-lg border border-line bg-slate-50 px-4 py-3 text-sm text-slate-700">
        <div className="font-semibold text-ink">Критерии оценки</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {activeCriteria.map((criterion) => (
            <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 ring-1 ring-line" key={criterion.id}>
              {criterion.shortName}
            </span>
          ))}
        </div>
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-semibold text-brand">Показать расшифровку критериев</summary>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            {activeCriteria.map((criterion) => (
              <div className="rounded-lg bg-white p-3 ring-1 ring-line" key={criterion.id}>
                <div className="font-semibold text-ink">{criterion.name}</div>
                <div className="mt-1 text-xs leading-5 text-muted">{criterion.description}</div>
              </div>
            ))}
          </div>
        </details>
      </div>

      {selectedPeriod?.status === "CLOSED" ? <div className="mb-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-muted">Период закрыт, редактирование недоступно.</div> : null}

      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[1080px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Подразделение</th>
              <th className="px-4 py-3">Критерии</th>
              <th className="px-4 py-3">Комментарий</th>
              <th className="px-4 py-3">Действие</th>
              <th className="px-4 py-3">Статус</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {availableEvaluatees.map((department) => {
              const row = rows[department.id] || blankRow();
              const required = requiredEvaluateeIds.has(department.id);
              const scores = activeCriteria.map((criterion) => Number(row.scores[criterion.id] ?? 10));
              const averageScore = Math.round(
                scores.reduce((sum, score) => sum + score, 0) / Math.max(scores.length, 1)
              );
              const commentRequired = !row.noInteraction && scores.some((score) => score <= 9);
              return (
                <tr className={required ? "bg-slate-50" : ""} key={department.id}>
                  <td className="px-4 py-4 align-top">
                    <DepartmentLabel department={department} className="font-semibold text-ink" />
                    {required ? <div className="mt-1 text-xs font-semibold text-brandDark">Обязательно оценить</div> : null}
                  </td>
                  <td className="px-4 py-4 align-top">
                    <div className="grid min-w-[360px] gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {activeCriteria.map((criterion) => (
                        <label className="rounded-lg border border-line bg-white p-2" key={criterion.id}>
                          <span className="block text-xs font-semibold text-slate-600">{criterion.shortName}</span>
                          <input
                            className="focus-ring mt-1 w-full rounded-md border border-line px-2 py-1.5 text-base font-semibold"
                            disabled={row.noInteraction || !canUseForm}
                            max={10}
                            min={1}
                            type="number"
                            value={row.scores[criterion.id] ?? 10}
                            onChange={(event) =>
                              updateRow(department.id, {
                                scores: {
                                  ...row.scores,
                                  [criterion.id]: Number(event.target.value)
                                },
                                noInteraction: false,
                                message: ""
                              })
                            }
                          />
                        </label>
                      ))}
                    </div>
                    <div className="mt-2 text-xs font-semibold text-slate-600">Итог: {averageScore} из 10</div>
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
