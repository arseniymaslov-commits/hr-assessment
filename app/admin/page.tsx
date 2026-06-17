import { Role } from "@prisma/client";
import AdminPanel from "@/components/admin-panel";
import AppShell from "@/components/app-shell";
import ScoreBadge from "@/components/score-badge";
import { requireUser } from "@/lib/auth";
import { getPeriodMetrics, getReferenceData } from "@/lib/metrics";

export default async function AdminPage() {
  const user = await requireUser([Role.ADMIN]);
  const [{ departments, evaluateeDepartments, periods, users, criteria }, metrics] = await Promise.all([
    getReferenceData(),
    getPeriodMetrics()
  ]);
  const departmentOptions = departments.map(({ id, name, shortName }) => ({ id, name, shortName }));
  const evaluateeDepartmentOptions = evaluateeDepartments.map(({ id, name, shortName }) => ({ id, name, shortName }));
  const periodOptions = periods.map(({ id, month, year, status }) => ({
    id,
    month,
    year,
    status
  }));
  const userOptions = users.map(({ id, name, email, role, position, departmentId, mustChangePassword, isActive, receivesNotifications }) => ({
    id,
    name,
    email,
    role,
    position,
    departmentId,
    mustChangePassword,
    isActive,
    receivesNotifications
  }));
  const criterionOptions = criteria.map(({ id, name, description }) => ({
    id,
    name,
    description
  }));
  const requirementOptions = metrics.requirements.map(
    ({ evaluatorDepartmentId, evaluateeDepartmentId }) => ({
      evaluatorDepartmentId,
      evaluateeDepartmentId
    })
  );

  return (
    <AppShell user={user}>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-ink">Админ-панель</h1>
        <p className="mt-1 text-sm text-muted">
          Управление справочниками, периодами, руководителями, экспортом и комментариями.
        </p>
      </div>

      <AdminPanel
        departments={departmentOptions}
        evaluateeDepartments={evaluateeDepartmentOptions}
        periods={periodOptions}
        users={userOptions}
        criteria={criterionOptions}
        requirements={requirementOptions}
      />

      <section className="mt-6 rounded-lg border border-line bg-white">
        <div className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-semibold text-ink">Все комментарии текущего периода</h2>
          {metrics.selectedPeriod ? (
            <a
              className="focus-ring rounded-lg border border-line px-3 py-2 text-sm font-medium hover:bg-slate-50"
              href={`/api/export?period=${metrics.selectedPeriod.id}`}
            >
              Скачать Excel
            </a>
          ) : null}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
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
              {metrics.evaluations
                .filter((evaluation) => evaluation.comment)
                .map((evaluation) => (
                  <tr key={evaluation.id}>
                    <td className="px-5 py-4 font-medium">
                      {evaluation.evaluatorDepartment?.name || evaluation.evaluatorUser?.name || "Директор"}
                    </td>
                    <td className="px-5 py-4">{evaluation.evaluateeDepartment.name}</td>
                    <td className="px-5 py-4">
                      {evaluation.noInteraction ? (
                        <span className="inline-flex rounded-full bg-slate-50 px-2.5 py-1 text-sm font-semibold text-slate-600 ring-1 ring-slate-200">
                          Нет взаимодействия
                        </span>
                      ) : (
                        <ScoreBadge score={evaluation.score} />
                      )}
                    </td>
                    <td className="max-w-lg px-5 py-4 text-slate-700">{evaluation.comment}</td>
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
