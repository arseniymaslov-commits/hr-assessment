import AppShell from "@/components/app-shell";
import DashboardSlideExport from "@/components/dashboard-slide-export";
import DepartmentFilter from "@/components/department-filter";
import PeriodFilter from "@/components/period-filter";
import ScoreBadge from "@/components/score-badge";
import { Role } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { fixed, periodLabel, scoreClass } from "@/lib/format";
import { getPeriodMetrics } from "@/lib/metrics";

export default async function DashboardPage({
  searchParams
}: {
  searchParams: { period?: string; department?: string };
}) {
  const user = await requireUser();
  const metrics = await getPeriodMetrics(searchParams.period);
  const leaderDepartmentId = user.role === Role.LEADER ? user.departmentId : null;
  const selectedDepartment = leaderDepartmentId || searchParams.department;

  const rows = selectedDepartment
    ? metrics.byEvaluatee.filter((row) => row.department.id === selectedDepartment)
    : metrics.byEvaluatee;
  const lowScores = leaderDepartmentId
    ? metrics.lowScores.filter((evaluation) => evaluation.evaluateeDepartmentId === leaderDepartmentId)
    : selectedDepartment
    ? metrics.lowScores.filter(
        (evaluation) =>
          evaluation.evaluateeDepartmentId === selectedDepartment ||
          evaluation.evaluatorDepartmentId === selectedDepartment
      )
    : metrics.lowScores;
  const visibleExpectedCount = leaderDepartmentId
    ? metrics.requirements.filter((requirement) => requirement.evaluateeDepartmentId === leaderDepartmentId).length
    : metrics.expectedCount;
  const visibleFilledCount = leaderDepartmentId
    ? metrics.evaluations.filter((evaluation) => evaluation.evaluateeDepartmentId === leaderDepartmentId).length
    : metrics.evaluations.length;
  const visibleMissingCount = Math.max(0, visibleExpectedCount - visibleFilledCount);
  const slideDepartmentRow = selectedDepartment
    ? metrics.byEvaluatee.find((row) => row.department.id === selectedDepartment) || null
    : null;
  const rankedDepartments = metrics.byEvaluatee
    .slice()
    .sort((a, b) => {
      if (a.average == null && b.average == null) return a.department.name.localeCompare(b.department.name);
      if (a.average == null) return 1;
      if (b.average == null) return -1;
      return b.average - a.average;
    });
  const slideRank = slideDepartmentRow
    ? rankedDepartments.findIndex((row) => row.department.id === slideDepartmentRow.department.id) + 1
    : null;
  const slideLowScores = selectedDepartment
    ? metrics.lowScores
        .filter((evaluation) => evaluation.evaluateeDepartmentId === selectedDepartment)
        .map((evaluation) => ({
          id: evaluation.id,
          score: evaluation.score,
          comment: evaluation.comment,
          evaluatorName: evaluation.evaluatorDepartment?.name || evaluation.evaluatorUser?.name || "Директор",
          evaluateeName: evaluation.evaluateeDepartment.name
        }))
    : [];
  const periodOptions = metrics.periods.map(({ id, month, year, status }) => ({
    id,
    month,
    year,
    status
  }));
  const departmentOptions = metrics.evaluateeDepartments.map(({ id, name }) => ({ id, name }));

  return (
    <AppShell user={user}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Дашборд взаимодействия</h1>
          <p className="mt-1 text-sm text-muted">
            {metrics.selectedPeriod ? periodLabel(metrics.selectedPeriod) : "Период не выбран"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <PeriodFilter periods={periodOptions} selectedPeriodId={metrics.selectedPeriod?.id} />
          {!leaderDepartmentId ? <DepartmentFilter departments={departmentOptions} /> : null}
          {metrics.selectedPeriod && !leaderDepartmentId ? (
            <a
              className="focus-ring rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              href={`/api/export?period=${metrics.selectedPeriod.id}`}
            >
              Экспорт Excel
            </a>
          ) : null}
        </div>
      </div>

      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Средний балл компании" value={fixed(metrics.companyAverage)} />
        <MetricCard label={leaderDepartmentId ? "Оценок ниже 9 по вашему отделу" : "Оценок ниже 9"} value={String(lowScores.length)} />
        <MetricCard label={leaderDepartmentId ? "Осталось оценок по вашему отделу" : "Отсутствующих оценок"} value={String(leaderDepartmentId ? visibleMissingCount : metrics.missingCount)} />
        <MetricCard
          label="Статус периода"
          value={metrics.selectedPeriod?.status === "OPEN" ? "Открыт" : "Закрыт"}
        />
      </section>

      {slideDepartmentRow && metrics.selectedPeriod ? (
        <DashboardSlideExport
          departmentName={slideDepartmentRow.department.name}
          periodLabel={periodLabel(metrics.selectedPeriod)}
          average={slideDepartmentRow.average}
          companyAverage={metrics.companyAverage}
          rank={slideRank}
          totalDepartments={rankedDepartments.length}
          lowScores={slideLowScores}
        />
      ) : null}

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_0.9fr]">
        <div className="rounded-lg border border-line bg-white">
          <div className="border-b border-line px-5 py-4">
            <h2 className="font-semibold text-ink">Подразделения</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-5 py-3">Подразделение</th>
                  <th className="px-5 py-3">Средний балл</th>
                  <th className="px-5 py-3">Оценок</th>
                  <th className="px-5 py-3">Нет взаимодействия</th>
                  <th className="px-5 py-3">Ниже 9</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((row) => (
                  <tr key={row.department.id}>
                    <td className="px-5 py-4 font-medium text-ink">{row.department.name}</td>
                    <td className="px-5 py-4">
                      <ScoreBadge score={row.average} />
                      {row.missingRequiredEvaluatorNames.length ? (
                        <div className="mt-2 max-w-xs text-xs leading-5 text-risk">
                          Нет обязательной оценки от: {row.missingRequiredEvaluatorNames.join(", ")}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-5 py-4 text-slate-700">{row.count}</td>
                    <td className="px-5 py-4 text-slate-700">{row.noInteractionCount}</td>
                    <td className="px-5 py-4 text-slate-700">{row.lowCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-lg border border-line bg-white">
          <div className="border-b border-line px-5 py-4">
            <h2 className="font-semibold text-ink">Рейтинг по среднему баллу</h2>
          </div>
          <div className="divide-y divide-line">
            {rows
              .slice()
              .sort((a, b) => (b.average || 0) - (a.average || 0))
              .map((row, index) => (
                <div className="flex items-center justify-between gap-4 px-5 py-3" key={row.department.id}>
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-sm font-semibold text-slate-700">
                      {index + 1}
                    </span>
                    <span className="truncate font-medium">{row.department.name}</span>
                  </div>
                  <ScoreBadge score={row.average} />
                </div>
              ))}
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div className="rounded-lg border border-line bg-white">
          <div className="border-b border-line px-5 py-4">
            <h2 className="font-semibold text-ink">Проблемные зоны</h2>
          </div>
          <div className="max-h-[430px] overflow-auto">
            {lowScores.length ? (
              <div className="divide-y divide-line">
                {lowScores.map((evaluation) => (
                  <div className="px-5 py-4" key={evaluation.id}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-sm font-semibold ring-1 ${scoreClass(evaluation.score)}`}>
                        {evaluation.score}
                      </span>
                      <span className="font-medium">
                        {evaluation.evaluatorDepartment?.name || evaluation.evaluatorUser?.name || "Директор"} → {evaluation.evaluateeDepartment.name}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-700">{evaluation.comment}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-5 py-8 text-sm text-muted">Низких оценок за период нет.</div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-line bg-white p-5">
          <h2 className="font-semibold text-ink">Динамика по месяцам</h2>
          <div className="mt-5 space-y-4">
            {metrics.dynamics.map((point) => {
              const width = point.average ? `${Math.max(8, point.average * 10)}%` : "0%";
              return (
                <div key={point.period.id}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="text-slate-700">{periodLabel(point.period)}</span>
                    <span className="font-semibold">{fixed(point.average)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100">
                    <div className="h-2 rounded-full bg-brand" style={{ width }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </AppShell>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-white p-5">
      <div className="text-sm text-muted">{label}</div>
      <div className="mt-2 text-3xl font-semibold text-ink">{value}</div>
    </div>
  );
}
