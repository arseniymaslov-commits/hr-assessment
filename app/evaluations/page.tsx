import AppShell from "@/components/app-shell";
import DepartmentLabel from "@/components/department-label";
import EvaluationForm from "@/components/evaluation-form";
import ScoreBadge from "@/components/score-badge";
import { Role } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { getDepartmentFullName } from "@/lib/department-decodings";
import { getPeriodMetrics, getReferenceData } from "@/lib/metrics";

export default async function EvaluationsPage() {
  const user = await requireUser([Role.ADMIN, Role.LEADER, Role.DIRECTOR]);
  const [{ departments, evaluateeDepartments, periods, criteria, requirements }, metrics] = await Promise.all([
    getReferenceData(),
    getPeriodMetrics()
  ]);

  const visibleEvaluations =
    user.role === "LEADER" && user.departmentId
      ? metrics.evaluations.filter((evaluation) => evaluation.evaluatorDepartmentId === user.departmentId)
      : user.role === "DIRECTOR"
        ? metrics.evaluations.filter((evaluation) => evaluation.evaluatorUserId === user.id)
        : metrics.evaluations;
  const departmentOptions = departments.map(({ id, name, shortName }) => ({ id, name, shortName }));
  const evaluateeDepartmentOptions = evaluateeDepartments.map(({ id, name, shortName }) => ({ id, name, shortName }));
  const periodOptions = periods.map(({ id, month, year, status }) => ({
    id,
    month,
    year,
    status
  }));
  const criterionOptions = criteria.map(({ id, name }) => ({ id, name }));
  const requirementOptions = requirements.map(
    ({ evaluatorDepartmentId, evaluateeDepartmentId }) => ({
      evaluatorDepartmentId,
      evaluateeDepartmentId
    })
  );

  return (
    <AppShell user={user}>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-ink">Заполнение оценки</h1>
        <p className="mt-1 text-sm text-muted">
          Оцените взаимодействие со всеми доступными подразделениями. Оценки 9 или ниже сохраняются только с комментарием.
        </p>
      </div>

      <EvaluationForm
        departments={departmentOptions}
        evaluateeDepartments={evaluateeDepartmentOptions}
        periods={periodOptions}
        criteria={criterionOptions}
        requirements={requirementOptions}
        existingEvaluations={visibleEvaluations.map((evaluation) => ({
          periodId: evaluation.periodId,
          criterionId: evaluation.criterionId,
          evaluatorDepartmentId: evaluation.evaluatorDepartmentId,
          evaluatorUserId: evaluation.evaluatorUserId,
          evaluateeDepartmentId: evaluation.evaluateeDepartmentId,
          score: evaluation.score,
          comment: evaluation.comment,
          noInteraction: evaluation.noInteraction
        }))}
        user={{
          id: user.id,
          role: user.role,
          departmentId: user.departmentId,
          departmentName: user.department?.name,
          departmentFullName: user.department
            ? getDepartmentFullName(user.department.name, user.department.shortName)
            : null
        }}
      />

      <section className="mt-6 rounded-lg border border-line bg-white">
        <div className="border-b border-line px-5 py-4">
          <h2 className="font-semibold text-ink">Последние оценки текущего периода</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-5 py-3">Кто оценивает</th>
                <th className="px-5 py-3">Кого оценивают</th>
                  <th className="px-5 py-3">Оценка / статус</th>
                <th className="px-5 py-3">Комментарий</th>
                <th className="px-5 py-3">Автор</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {visibleEvaluations.map((evaluation) => (
                <tr key={evaluation.id}>
                  <td className="px-5 py-4 font-medium text-ink">
                    {evaluation.evaluatorDepartment ? (
                      <DepartmentLabel department={evaluation.evaluatorDepartment} />
                    ) : (
                      evaluation.evaluatorUser?.name || "Директор"
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <DepartmentLabel department={evaluation.evaluateeDepartment} />
                  </td>
                  <td className="px-5 py-4">
                    {evaluation.noInteraction ? (
                      <span className="inline-flex rounded-full bg-slate-50 px-2.5 py-1 text-sm font-semibold text-slate-600 ring-1 ring-slate-200">
                        Нет взаимодействия
                      </span>
                    ) : (
                      <ScoreBadge score={evaluation.score} />
                    )}
                  </td>
                  <td className="max-w-md px-5 py-4 text-slate-700">{evaluation.comment || "—"}</td>
                  <td className="px-5 py-4 text-slate-700">{evaluation.author.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
