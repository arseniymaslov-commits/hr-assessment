import AppShell from "@/components/app-shell";
import DepartmentLabel from "@/components/department-label";
import EvaluationForm from "@/components/evaluation-form";
import ScoreBadge from "@/components/score-badge";
import { Role } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { getDepartmentFullName } from "@/lib/department-decodings";
import { isMissingEvaluation, MISSING_EVALUATION_LABEL } from "@/lib/evaluation-status";
import { getEvaluationScreenMetrics, getReferenceData } from "@/lib/metrics";
import { prisma } from "@/lib/prisma";

export default async function EvaluationsPage({
  searchParams
}: {
  searchParams: { sort?: string };
}) {
  const user = await requireUser([Role.ADMIN, Role.LEADER, Role.DIRECTOR]);
  const [{ departments, evaluateeDepartments, periods, criteria, requirements }, metrics] = await Promise.all([
    getReferenceData({ ensurePeriod: false }),
    getEvaluationScreenMetrics()
  ]);
  const allVisibleEvaluations = await prisma.evaluation.findMany({
    where:
      user.role === "LEADER" && user.departmentId
        ? { evaluatorDepartmentId: user.departmentId }
        : user.role === "DIRECTOR"
          ? { evaluatorUserId: user.id }
          : {},
    select: {
      periodId: true,
      criterionId: true,
      evaluatorDepartmentId: true,
      evaluatorUserId: true,
      evaluateeDepartmentId: true,
      score: true,
      comment: true,
      deviationCategories: true,
      noInteraction: true,
      updatedAt: true
    }
  });

  const visibleEvaluations =
    user.role === "LEADER" && user.departmentId
      ? metrics.evaluations.filter((evaluation) => evaluation.evaluatorDepartmentId === user.departmentId)
      : user.role === "DIRECTOR"
        ? metrics.evaluations.filter((evaluation) => evaluation.evaluatorUserId === user.id)
        : metrics.evaluations;
  const sortMode = searchParams.sort === "author" ? "author" : "date";
  const sortedVisibleEvaluations = visibleEvaluations.slice().sort((a, b) => {
    if (sortMode === "author") {
      const byAuthor = a.author.name.localeCompare(b.author.name, "ru");
      if (byAuthor !== 0) return byAuthor;
    }
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  });
  const departmentOptions = departments.map(({ id, name, shortName }) => ({ id, name, shortName }));
  const evaluateeDepartmentOptions = evaluateeDepartments.map(({ id, name, shortName }) => ({ id, name, shortName }));
  const periodOptions = periods.map(({ id, month, year, status, createdAt, requests }) => ({
    id,
    month,
    year,
    status,
    assessmentDate: (requests[0]?.scheduledAt || createdAt).toISOString()
  }));
  const criterionOptions = criteria.map(({ id, name, description }) => ({ id, name, description }));
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
          Оцените взаимодействие со всеми доступными подразделениями. Оценка ниже 10 сохраняется только с категорией отклонения и комментарием.
        </p>
      </div>

      <EvaluationForm
        departments={departmentOptions}
        evaluateeDepartments={evaluateeDepartmentOptions}
        periods={periodOptions}
        criteria={criterionOptions}
        requirements={requirementOptions}
        existingEvaluations={allVisibleEvaluations.map((evaluation) => ({
          periodId: evaluation.periodId,
          criterionId: evaluation.criterionId,
          evaluatorDepartmentId: evaluation.evaluatorDepartmentId,
          evaluatorUserId: evaluation.evaluatorUserId,
          evaluateeDepartmentId: evaluation.evaluateeDepartmentId,
          score: evaluation.score,
          comment: evaluation.comment,
          deviationCategories: evaluation.deviationCategories,
          noInteraction: evaluation.noInteraction,
          updatedAt: evaluation.updatedAt.toISOString()
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
        <div className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-ink">Последние оценки текущего периода</h2>
            <p className="mt-1 text-sm text-muted">Дата оценки указана по времени Бишкека.</p>
          </div>
          <div className="flex rounded-lg border border-line bg-white p-1 text-sm">
            <a
              className={`rounded-md px-3 py-1.5 font-medium transition ${
                sortMode === "date" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
              }`}
              href="/evaluations?sort=date"
            >
              По дате
            </a>
            <a
              className={`rounded-md px-3 py-1.5 font-medium transition ${
                sortMode === "author" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
              }`}
              href="/evaluations?sort=author"
            >
              По автору
            </a>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-5 py-3">Кто оценивает</th>
                <th className="px-5 py-3">Кого оценивают</th>
                <th className="px-5 py-3">Оценка / статус</th>
                <th className="px-5 py-3">Категории</th>
                <th className="px-5 py-3">Комментарий</th>
                <th className="px-5 py-3">Дата оценки</th>
                <th className="px-5 py-3">Автор</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {sortedVisibleEvaluations.map((evaluation) => (
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
                    {isMissingEvaluation(evaluation) ? (
                      <span className="inline-flex rounded-full bg-red-50 px-2.5 py-1 text-sm font-semibold text-red-700 ring-1 ring-red-100">
                        {MISSING_EVALUATION_LABEL}
                      </span>
                    ) : evaluation.noInteraction ? (
                      <span className="inline-flex rounded-full bg-slate-50 px-2.5 py-1 text-sm font-semibold text-slate-600 ring-1 ring-slate-200">
                        Нет взаимодействия
                      </span>
                    ) : (
                      <ScoreBadge score={evaluation.score} />
                    )}
                  </td>
                  <td className="max-w-sm px-5 py-4 text-slate-700">
                    {evaluation.deviationCategories.length ? evaluation.deviationCategories.join(", ") : "—"}
                  </td>
                  <td className="max-w-md px-5 py-4 text-slate-700">
                    {isMissingEvaluation(evaluation) ? MISSING_EVALUATION_LABEL : evaluation.comment || "-"}
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-slate-700">
                    {evaluation.updatedAt.toLocaleString("ru-RU", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: "Asia/Bishkek"
                    })}
                  </td>
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
