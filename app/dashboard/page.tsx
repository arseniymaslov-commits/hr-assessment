import AppShell from "@/components/app-shell";
import CompanyDashboardPanel from "@/components/company-dashboard-panel";
import DashboardSlideExport from "@/components/dashboard-slide-export";
import DepartmentLabel from "@/components/department-label";
import DepartmentFilter from "@/components/department-filter";
import PeriodFilter from "@/components/period-filter";
import ScoreBadge from "@/components/score-badge";
import { Role } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { departmentOptionLabel } from "@/lib/department-decodings";
import { getDirectorDepartmentIds } from "@/lib/director-scope";
import { resolveEvaluateeDepartmentId } from "@/lib/department-matching";
import { fixed, periodLabel, scoreClass } from "@/lib/format";
import { getPeriodMetrics } from "@/lib/metrics";
import { MIN_RANKING_EVALUATIONS, isRankingEligible, sortRankingCandidates } from "@/lib/ranking";

export default async function DashboardPage({
  searchParams
}: {
  searchParams: { period?: string; department?: string };
}) {
  const user = await requireUser();
  const metrics = await getPeriodMetrics(searchParams.period);
  const leaderDepartmentId =
    user.role === Role.LEADER ? resolveEvaluateeDepartmentId(user.department, metrics.evaluateeDepartments) : null;
  const directorDepartmentIds = getDirectorDepartmentIds(user);
  const directorDepartmentIdSet = new Set(directorDepartmentIds);
  const hasDirectorScope = user.role === Role.DIRECTOR && directorDepartmentIds.length > 0;
  const leaderDepartmentUnresolved = user.role === Role.LEADER && !leaderDepartmentId;
  const canViewProblemComments =
    user.role === Role.ADMIN || user.role === Role.DIRECTOR || user.role === Role.LEADER;
  const canExportExcel = user.role === Role.ADMIN || user.role === Role.ANALYST || user.role === Role.DIRECTOR;
  const requestedDepartment =
    hasDirectorScope && searchParams.department && !directorDepartmentIdSet.has(searchParams.department)
      ? undefined
      : searchParams.department;
  const selectedDepartment = leaderDepartmentId || (user.role === Role.LEADER ? undefined : requestedDepartment);
  const scopedEvaluateeRows = hasDirectorScope
    ? metrics.byEvaluatee.filter((row) => directorDepartmentIdSet.has(row.department.id))
    : metrics.byEvaluatee;
  const scopedEvaluations = hasDirectorScope
    ? metrics.evaluations.filter((evaluation) => directorDepartmentIdSet.has(evaluation.evaluateeDepartmentId))
    : metrics.evaluations;
  const scopedAverage = average(
    scopedEvaluations
      .filter((evaluation) => !evaluation.noInteraction && evaluation.score != null)
      .map((evaluation) => evaluation.score as number)
  );

  const rows = leaderDepartmentUnresolved
    ? []
    : selectedDepartment
    ? scopedEvaluateeRows.filter((row) => row.department.id === selectedDepartment)
    : scopedEvaluateeRows;
  const lowScores = leaderDepartmentUnresolved
    ? []
    : leaderDepartmentId
    ? metrics.lowScores.filter((evaluation) => evaluation.evaluateeDepartmentId === leaderDepartmentId)
    : selectedDepartment
    ? metrics.lowScores.filter(
        (evaluation) =>
          evaluation.evaluateeDepartmentId === selectedDepartment ||
          evaluation.evaluatorDepartmentId === selectedDepartment
      )
    : hasDirectorScope
    ? metrics.lowScores.filter((evaluation) => directorDepartmentIdSet.has(evaluation.evaluateeDepartmentId))
    : metrics.lowScores;
  const visibleExpectedCount = leaderDepartmentUnresolved
    ? 0
    : selectedDepartment
    ? metrics.requirements.filter((requirement) => requirement.evaluateeDepartmentId === selectedDepartment).length
    : hasDirectorScope
    ? metrics.requirements.filter((requirement) => directorDepartmentIdSet.has(requirement.evaluateeDepartmentId)).length
    : metrics.expectedCount;
  const visibleFilledCount = leaderDepartmentUnresolved
    ? 0
    : selectedDepartment
    ? scopedEvaluations.filter((evaluation) => evaluation.evaluateeDepartmentId === selectedDepartment).length
    : hasDirectorScope
    ? scopedEvaluations.length
    : Math.max(0, metrics.expectedCount - metrics.missingCount);
  const visibleMissingCount = Math.max(0, visibleExpectedCount - visibleFilledCount);
  const slideDepartmentRow = selectedDepartment
    ? scopedEvaluateeRows.find((row) => row.department.id === selectedDepartment) || null
    : null;
  const rankingRows = scopedEvaluateeRows.map((row) => ({ ...row, name: row.department.name }));
  const rankedDepartments = rankingRows.filter(isRankingEligible).sort(sortRankingCandidates);
  const insufficientRankingDepartments = rankingRows
    .filter((row) => !isRankingEligible(row))
    .sort((a, b) => b.count - a.count || a.department.name.localeCompare(b.department.name, "ru"));
  const slideRank = slideDepartmentRow
    ? rankedDepartments.findIndex((row) => row.department.id === slideDepartmentRow.department.id) + 1
    : null;
  const canExportDepartmentSlide = canViewProblemComments && Boolean(slideDepartmentRow);
  const canViewCompanyInteractiveDashboard =
    canViewProblemComments && !selectedDepartment && (user.role === Role.ADMIN || user.role === Role.DIRECTOR);
  const slideTitle = slideDepartmentRow ? slideDepartmentRow.department.name : "Компания";
  const slideAverage = slideDepartmentRow ? slideDepartmentRow.average : null;
  const slideFilledCount = Math.max(0, visibleExpectedCount - visibleMissingCount);
  const slideLowScores = (slideDepartmentRow
    ? metrics.lowScores.filter((evaluation) => evaluation.evaluateeDepartmentId === slideDepartmentRow.department.id)
    : []
  ).map((evaluation) => ({
    id: evaluation.id,
    score: evaluation.score,
    comment: evaluation.comment,
    deviationCategories: evaluation.deviationCategories,
    evaluatorName: evaluation.evaluatorDepartment?.name || evaluation.evaluatorUser?.name || "Директор",
    evaluateeName: evaluation.evaluateeDepartment.name
  }));
  const companyLowScores = lowScores.map((evaluation) => ({
    id: evaluation.id,
    score: evaluation.score,
    comment: evaluation.comment,
    deviationCategories: evaluation.deviationCategories,
    evaluatorName: evaluation.evaluatorDepartment
      ? departmentOptionLabel(evaluation.evaluatorDepartment)
      : evaluation.evaluatorUser?.name || "Директор",
    evaluateeName: departmentOptionLabel(evaluation.evaluateeDepartment)
  }));
  const slideRanking = rankedDepartments.map((row) => ({
    id: row.department.id,
    name: row.department.name,
    average: row.average,
    count: row.count,
    lowCount: row.lowCount,
    noInteractionCount: row.noInteractionCount,
    averageDelta: row.averageDelta
  }));
  const insufficientSlideRanking = insufficientRankingDepartments.map((row) => ({
    id: row.department.id,
    name: row.department.name,
    average: row.average,
    count: row.count,
    lowCount: row.lowCount,
    noInteractionCount: row.noInteractionCount,
    averageDelta: row.averageDelta
  }));
  const completionRows = metrics.completion
    .filter((row) => !hasDirectorScope || directorDepartmentIdSet.has(row.department.id))
    .map((row) => ({
      id: row.department.id,
      name: departmentOptionLabel(row.department),
      filled: row.filled,
      expected: row.expected,
      missing: row.missing,
      isComplete: row.isComplete
    }));
  const evaluationKeys = new Set(
    metrics.evaluations
      .filter((evaluation) => evaluation.evaluatorDepartmentId)
      .map((evaluation) => `${evaluation.evaluatorDepartmentId}:${evaluation.evaluateeDepartmentId}`)
  );
  const departmentCompletionRows = slideDepartmentRow
    ? metrics.requirements
        .filter((requirement) => requirement.evaluateeDepartmentId === slideDepartmentRow.department.id)
        .map((requirement) => {
          const evaluatorDepartment = metrics.departments.find(
            (department) => department.id === requirement.evaluatorDepartmentId
          );
          const filled = evaluationKeys.has(`${requirement.evaluatorDepartmentId}:${requirement.evaluateeDepartmentId}`)
            ? 1
            : 0;
          return {
            id: requirement.evaluatorDepartmentId,
            name: evaluatorDepartment ? departmentOptionLabel(evaluatorDepartment) : "Подразделение",
            filled,
            expected: 1,
            missing: filled ? 0 : 1,
            isComplete: Boolean(filled)
          };
        })
    : [];
  const missingCompletionRows = (slideDepartmentRow ? departmentCompletionRows : completionRows)
    .filter((row) => row.missing > 0)
    .slice(0, 10);
  const lowScoreRepeatCounts = metrics.lowScoreRepeatCounts as Record<string, number>;
  const periodOptions = metrics.periods.map(({ id, month, year, status }) => ({
    id,
    month,
    year,
    status
  }));
  const departmentOptions = metrics.evaluateeDepartments
    .filter((department) => !hasDirectorScope || directorDepartmentIdSet.has(department.id))
    .map(({ id, name, shortName }) => ({ id, name, shortName }));

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
          {metrics.selectedPeriod && canExportExcel ? (
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
        <MetricCard label={hasDirectorScope ? "Средний балл ваших отделов" : "Средний балл компании"} value={fixed(scopedAverage)} />
        <MetricCard label={leaderDepartmentId ? "Оценок 9 и ниже по вашему отделу" : "Оценок 9 и ниже"} value={String(lowScores.length)} />
        <MetricCard
          label={leaderDepartmentId ? "Оценили ваш отдел" : "Отсутствующих оценок"}
          value={leaderDepartmentId ? `${visibleFilledCount} из ${visibleExpectedCount}` : String(visibleMissingCount)}
        />
        <MetricCard
          label="Статус периода"
          value={metrics.selectedPeriod?.status === "OPEN" ? "Открыт" : "Закрыт"}
        />
      </section>

      {leaderDepartmentUnresolved ? (
        <section className="mt-6 rounded-lg border border-amber-100 bg-amber-50 px-5 py-4">
          <h2 className="font-semibold text-amber-900">Нужно уточнить подразделение пользователя</h2>
          <p className="mt-1 text-sm text-amber-800">
            Для вашего аккаунта указан отдел «{user.department?.name || "не указан"}», но он не найден в списке
            оцениваемых подразделений. Администратору нужно привязать пользователя к корректному отделу, например
            «Бухгалтерия», чтобы открылся персональный дашборд и скачивание PNG.
          </p>
        </section>
      ) : null}

      {!leaderDepartmentUnresolved && user.role !== Role.LEADER ? (
      <section className="mt-6 rounded-lg border border-line bg-white p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-ink">Не заполнено</h2>
            <p className="mt-1 text-sm text-muted">
              Отдельный контроль отсутствующих обязательных оценок. Это не считается «нет взаимодействия».
            </p>
          </div>
          <span className="rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-700 ring-1 ring-amber-100">
            осталось: {visibleMissingCount}
          </span>
        </div>
        {missingCompletionRows.length ? (
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {missingCompletionRows.map((row) => (
              <div className="rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2 text-sm" key={row.id}>
                <div className="break-words font-semibold text-ink">{row.name}</div>
                <div className="mt-1 text-xs text-amber-800">Не заполнено: {row.missing}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            Все обязательные оценки заполнены.
          </div>
        )}
      </section>
      ) : null}

      {slideDepartmentRow && metrics.selectedPeriod ? (
        <CompanyDashboardPanel
          mode="department"
          title={slideDepartmentRow.department.name}
          periodLabel={periodLabel(metrics.selectedPeriod)}
          average={slideDepartmentRow.average}
          companyAverage={scopedAverage}
          rank={slideRank}
          totalDepartments={rankedDepartments.length}
          lowScores={slideLowScores}
          ranking={slideRanking}
          insufficientData={insufficientSlideRanking}
          completion={departmentCompletionRows}
          filledCount={slideFilledCount}
          missingCount={visibleMissingCount}
          expectedCount={visibleExpectedCount}
        />
      ) : null}

      {canExportDepartmentSlide && metrics.selectedPeriod ? (
        <DashboardSlideExport
          mode="department"
          title={slideTitle}
          periodLabel={periodLabel(metrics.selectedPeriod)}
          average={slideAverage}
          companyAverage={scopedAverage}
          rank={slideRank}
          totalDepartments={rankedDepartments.length}
          lowScores={slideLowScores}
          ranking={slideRanking}
          filledCount={slideFilledCount}
          missingCount={visibleMissingCount}
          expectedCount={visibleExpectedCount}
        />
      ) : null}

      {canViewCompanyInteractiveDashboard && metrics.selectedPeriod ? (
        <CompanyDashboardPanel
          mode="company"
          title={hasDirectorScope ? "Дашборд закрепленных подразделений" : undefined}
          periodLabel={periodLabel(metrics.selectedPeriod)}
          companyAverage={scopedAverage}
          lowScores={companyLowScores}
          ranking={slideRanking}
          insufficientData={insufficientSlideRanking}
          completion={completionRows}
          filledCount={Math.max(0, visibleExpectedCount - visibleMissingCount)}
          missingCount={visibleMissingCount}
          expectedCount={visibleExpectedCount}
        />
      ) : null}

      <section className="mt-6 grid gap-6 2xl:grid-cols-[minmax(0,1.35fr)_minmax(0,0.9fr)]">
        <div className="min-w-0 rounded-lg border border-line bg-white">
          <div className="border-b border-line px-5 py-4">
            <h2 className="font-semibold text-ink">Подразделения</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <colgroup>
                <col className="w-[38%]" />
                <col className="w-[22%]" />
                <col className="w-[13%]" />
                <col className="w-[17%]" />
                <col className="w-[10%]" />
              </colgroup>
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-5 py-3">Подразделение</th>
                  <th className="px-5 py-3">Средний балл</th>
                  <th className="px-5 py-3">Оценок</th>
                  <th className="px-5 py-3">Нет взаимодействия</th>
                  <th className="px-5 py-3">9 и ниже</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((row) => (
                  <tr key={row.department.id}>
                    <td className="px-5 py-4">
                      <DepartmentLabel department={row.department} />
                    </td>
                    <td className="px-5 py-4">
                      <ScoreBadge score={row.average} />
                      <DeltaBadge value={row.averageDelta} />
                      {!isRankingEligible({ average: row.average, count: row.count }) ? (
                        <div className="mt-2">
                          <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                            вне рейтинга: оценок {row.count}/{MIN_RANKING_EVALUATIONS}
                          </span>
                        </div>
                      ) : null}
                      {row.missingRequiredEvaluatorNames.length ? (
                        <div className="mt-2">
                          <span
                            className="inline-flex whitespace-nowrap rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-risk ring-1 ring-red-100"
                            title={`Нет обязательной оценки от: ${row.missingRequiredEvaluatorNames.join(", ")}`}
                          >
                            не оценили: {row.missingRequiredEvaluatorNames.length}
                          </span>
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

        <div className="min-w-0 rounded-lg border border-line bg-white">
          <div className="border-b border-line px-5 py-4">
            <h2 className="font-semibold text-ink">Рейтинг по среднему баллу</h2>
          </div>
          <div className="divide-y divide-line">
            {rows
              .map((row) => ({ ...row, name: row.department.name }))
              .filter(isRankingEligible)
              .sort(sortRankingCandidates)
              .map((row, index) => (
                <div className="flex items-center justify-between gap-4 px-5 py-3" key={row.department.id}>
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-sm font-semibold text-slate-700">
                      {index + 1}
                    </span>
                    <DepartmentLabel
                      department={row.department}
                      className="truncate font-medium text-ink"
                      mutedClassName="mt-0 truncate text-xs text-muted"
                    />
                  </div>
                  <ScoreBadge score={row.average} />
                  <DeltaBadge value={row.averageDelta} />
                </div>
            ))}
          </div>
          {insufficientRankingDepartments.length ? (
            <div className="border-t border-line bg-slate-50 px-5 py-4">
              <div className="text-sm font-semibold text-ink">Недостаточно данных</div>
              <div className="mt-1 text-xs text-muted">
                В рейтинг попадают отделы с минимум {MIN_RANKING_EVALUATIONS} оценками.
              </div>
              <div className="mt-3 space-y-2">
                {insufficientRankingDepartments.slice(0, 8).map((row) => (
                  <div className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-line" key={row.department.id}>
                    <DepartmentLabel
                      department={row.department}
                      className="truncate font-medium text-ink"
                      mutedClassName="mt-0 truncate text-xs text-muted"
                    />
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                      оценок {row.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div className="rounded-lg border border-line bg-white">
          <div className="border-b border-line px-5 py-4">
            <h2 className="font-semibold text-ink">Проблемные зоны</h2>
          </div>
          <div className="max-h-[430px] overflow-auto">
            {!canViewProblemComments ? (
              <div className="px-5 py-8 text-sm text-muted">
                Комментарии доступны руководителю оцениваемого отдела, директору и администратору.
              </div>
            ) : lowScores.length ? (
              <div className="divide-y divide-line">
                {lowScores.map((evaluation) => (
                  <div className="px-5 py-4" key={evaluation.id}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-sm font-semibold ring-1 ${scoreClass(evaluation.score)}`}>
                        {evaluation.score}
                      </span>
                      <span className="font-medium">
                        {evaluation.evaluatorDepartment
                          ? departmentOptionLabel(evaluation.evaluatorDepartment)
                          : evaluation.evaluatorUser?.name || "Директор"}{" "}
                        → {departmentOptionLabel(evaluation.evaluateeDepartment)}
                      </span>
                    </div>
                    {lowScoreRepeatCounts[
                      `${evaluation.evaluatorDepartmentId || evaluation.evaluatorUserId || "director"}:${evaluation.evaluateeDepartmentId}`
                    ] ? (
                      <div className="mt-2 text-xs font-semibold text-amber-700">
                        Повторяется в прошлых периодах:{" "}
                        {
                          lowScoreRepeatCounts[
                            `${evaluation.evaluatorDepartmentId || evaluation.evaluatorUserId || "director"}:${evaluation.evaluateeDepartmentId}`
                          ]
                        }
                      </div>
                    ) : null}
                    {evaluation.deviationCategories.length ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {evaluation.deviationCategories.map((category) => (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600" key={category}>
                            {category}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{evaluation.comment}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-5 py-8 text-sm text-muted">Оценок 9 и ниже за период нет.</div>
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
                    <div className="progress-fill h-2 rounded-full" style={{ width }} />
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
    <div className="animate-soft-in interactive-card rounded-lg border border-line bg-white p-5">
      <div className="text-sm text-muted">{label}</div>
      <div className="animate-value-pop mt-2 text-3xl font-semibold text-ink">{value}</div>
    </div>
  );
}

function DeltaBadge({ value }: { value?: number | null }) {
  if (value == null) return null;
  const positive = value > 0;
  const neutral = Math.abs(value) < 0.005;
  return (
    <span
      className={`ml-2 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
        neutral
          ? "bg-slate-100 text-slate-600"
          : positive
            ? "bg-emerald-50 text-emerald-700"
            : "bg-red-50 text-red-700"
      }`}
    >
      {neutral ? "0.00" : `${positive ? "+" : ""}${value.toFixed(2)}`}
    </span>
  );
}

function average(scores: number[]) {
  return scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null;
}
