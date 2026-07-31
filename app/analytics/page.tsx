import AppShell from "@/components/app-shell";
import DepartmentLabel from "@/components/department-label";
import PeriodFilter from "@/components/period-filter";
import ScoreBadge from "@/components/score-badge";
import { Role } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { departmentOptionLabel } from "@/lib/department-decodings";
import { fixed, periodLabel, scoreClass } from "@/lib/format";
import { getPeriodMetrics } from "@/lib/metrics";

type AnalyticsPageProps = {
  searchParams: { period?: string };
};

export default async function AnalyticsPage({ searchParams }: AnalyticsPageProps) {
  const user = await requireUser([Role.ADMIN, Role.ANALYST, Role.DIRECTOR]);
  const metrics = await getPeriodMetrics(searchParams.period);
  const selectedPeriod = metrics.selectedPeriod;
  const filledCount = Math.max(0, metrics.expectedCount - metrics.missingCount);
  const completionPercent = metrics.expectedCount ? Math.round((filledCount / metrics.expectedCount) * 100) : 0;
  const lowShare = metrics.evaluations.length ? Math.round((metrics.lowScores.length / metrics.evaluations.length) * 100) : 0;
  const previousPoint = metrics.dynamics.length >= 2 ? metrics.dynamics[metrics.dynamics.length - 2] : null;
  const currentDelta =
    metrics.companyAverage != null && previousPoint?.average != null ? metrics.companyAverage - previousPoint.average : null;
  const scoredEvaluations = metrics.evaluations.filter(
    (evaluation) => !evaluation.noInteraction && evaluation.score != null
  );
  const noInteractionCount = metrics.evaluations.filter((evaluation) => evaluation.noInteraction).length;
  const scoreBuckets = [
    {
      label: "10",
      description: "без отклонений",
      value: scoredEvaluations.filter((evaluation) => evaluation.score === 10).length,
      className: "bg-emerald-500"
    },
    {
      label: "9",
      description: "незначительно",
      value: scoredEvaluations.filter((evaluation) => evaluation.score === 9).length,
      className: "bg-lime-500"
    },
    {
      label: "8",
      description: "требует внимания",
      value: scoredEvaluations.filter((evaluation) => evaluation.score === 8).length,
      className: "bg-amber-500"
    },
    {
      label: "≤7",
      description: "критично",
      value: scoredEvaluations.filter((evaluation) => (evaluation.score || 0) <= 7).length,
      className: "bg-red-500"
    },
    {
      label: "Нет взаим.",
      description: "не было контакта",
      value: noInteractionCount,
      className: "bg-slate-400"
    }
  ];
  const maxScoreBucket = Math.max(1, ...scoreBuckets.map((bucket) => bucket.value));
  const trendPoints = metrics.dynamics.slice(-6);

  const periodOptions = metrics.periods.map(({ id, month, year, status }) => ({ id, month, year, status }));
  const categoryCounts = metrics.lowScores
    .flatMap((evaluation) => evaluation.deviationCategories)
    .reduce<Record<string, number>>((acc, category) => {
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, {});
  const categories = Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const riskDepartments = metrics.byEvaluatee
    .map((row) => ({
      ...row,
      riskScore: row.lowCount * 3 + row.missingRequiredEvaluatorNames.length * 2 + row.noInteractionCount
    }))
    .filter((row) => row.riskScore > 0)
    .sort((a, b) => b.riskScore - a.riskScore || (a.average ?? 0) - (b.average ?? 0))
    .slice(0, 10);
  const missingEvaluators = metrics.completion
    .filter((row) => row.missing > 0)
    .sort((a, b) => b.missing - a.missing)
    .slice(0, 10);
  const repeatedLowScores = metrics.lowScores
    .filter((evaluation) => {
      const key = `${evaluation.evaluatorDepartmentId || evaluation.evaluatorUserId || "director"}:${evaluation.evaluateeDepartmentId}`;
      return (metrics.lowScoreRepeatCounts as Record<string, number>)[key] > 0;
    })
    .slice(0, 8);
  const departmentTrends = metrics.byEvaluatee
    .filter((row) => row.average != null && row.averageDelta != null)
    .sort((a, b) => Math.abs(b.averageDelta || 0) - Math.abs(a.averageDelta || 0))
    .slice(0, 8);

  return (
    <AppShell user={user}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Аналитика HRD</h1>
          <p className="mt-1 text-sm text-muted">
            {selectedPeriod ? periodLabel(selectedPeriod) : "Период не выбран"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <PeriodFilter periods={periodOptions} selectedPeriodId={selectedPeriod?.id} />
          {selectedPeriod ? (
            <a
              className="focus-ring rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              href={`/api/export?period=${selectedPeriod.id}`}
            >
              Экспорт Excel
            </a>
          ) : null}
        </div>
      </div>

      <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AnalyticsCard label="Средний балл компании" value={fixed(metrics.companyAverage)} hint={deltaLabel(currentDelta)} />
        <AnalyticsCard label="Заполнение обязательных оценок" value={`${completionPercent}%`} hint={`${filledCount} из ${metrics.expectedCount}`} />
        <AnalyticsCard label="Оценки 9 и ниже" value={String(metrics.lowScores.length)} hint={`${lowShare}% от заполненных`} />
        <AnalyticsCard label="Осталось оценок" value={String(metrics.missingCount)} hint="по обязательным связям" />
      </section>

      <section className="mt-6 grid gap-5 xl:grid-cols-[0.9fr_1.25fr_1fr]">
        <GaugePanel
          average={metrics.companyAverage}
          delta={currentDelta}
          filledCount={filledCount}
          expectedCount={metrics.expectedCount}
        />
        <TrendPanel points={trendPoints} />
        <DistributionPanel buckets={scoreBuckets} maxValue={maxScoreBucket} total={scoredEvaluations.length + noInteractionCount} />
      </section>

      <section className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <Panel title="Фокус HRD: подразделения в зоне внимания">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">Подразделение</th>
                  <th className="px-4 py-3">Балл</th>
                  <th className="px-4 py-3">9 и ниже</th>
                  <th className="px-4 py-3">Нет взаим.</th>
                  <th className="px-4 py-3">Не оценили</th>
                  <th className="px-4 py-3">Приоритет</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {riskDepartments.map((row) => (
                  <tr key={row.department.id}>
                    <td className="px-4 py-3">
                      <DepartmentLabel department={row.department} />
                    </td>
                    <td className="px-4 py-3">
                      <ScoreBadge score={row.average} />
                    </td>
                    <td className="px-4 py-3 text-slate-700">{row.lowCount}</td>
                    <td className="px-4 py-3 text-slate-700">{row.noInteractionCount}</td>
                    <td className="px-4 py-3">
                      {row.missingRequiredEvaluatorNames.length ? (
                        <span
                          className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-risk ring-1 ring-red-100"
                          title={row.missingRequiredEvaluatorNames.join(", ")}
                        >
                          {row.missingRequiredEvaluatorNames.length}
                        </span>
                      ) : (
                        <span className="text-muted">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <PriorityBadge value={row.riskScore} />
                    </td>
                  </tr>
                ))}
                {!riskDepartments.length ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-sm text-muted" colSpan={6}>
                      По выбранному периоду зон внимания нет.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Дисциплина заполнения">
          <div className="max-h-[390px] space-y-2 overflow-auto p-4">
            {missingEvaluators.length ? (
              missingEvaluators.map((row) => (
                <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2" key={row.department.id}>
                  <DepartmentLabel
                    department={row.department}
                    className="truncate font-semibold text-ink"
                    mutedClassName="mt-0 truncate text-xs text-muted"
                  />
                  <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-100">
                    осталось {row.missing}
                  </span>
                </div>
              ))
            ) : (
              <div className="rounded-lg bg-emerald-50 px-4 py-6 text-center text-sm font-medium text-emerald-700">
                Все обязательные оценки заполнены.
              </div>
            )}
          </div>
        </Panel>
      </section>

      <section className="mt-6 grid gap-5 xl:grid-cols-2 2xl:grid-cols-4">
        <Panel title="Категории отклонений">
          <div className="space-y-3 p-4">
            {categories.length ? (
              categories.map(([category, count]) => (
                <div key={category}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate text-slate-700" title={category}>{category}</span>
                    <span className="font-semibold text-ink">{count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100">
                    <div className="progress-fill h-2 rounded-full" style={{ width: `${Math.max(8, (count / categories[0][1]) * 100)}%` }} />
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-muted">Категорий пока нет.</div>
            )}
          </div>
        </Panel>

        <Panel title="Повторяющиеся проблемы">
          <div className="max-h-[360px] space-y-2 overflow-auto p-4">
            {repeatedLowScores.length ? (
              repeatedLowScores.map((evaluation) => {
                const key = `${evaluation.evaluatorDepartmentId || evaluation.evaluatorUserId || "director"}:${evaluation.evaluateeDepartmentId}`;
                const repeats = (metrics.lowScoreRepeatCounts as Record<string, number>)[key] || 0;
                return (
                  <div className="rounded-lg border border-line bg-slate-50 p-3" key={evaluation.id}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 text-sm font-semibold text-ink">
                        <span className="truncate">
                          {evaluation.evaluatorDepartment
                            ? departmentOptionLabel(evaluation.evaluatorDepartment)
                            : evaluation.evaluatorUser?.name || "Директор"}
                        </span>
                        <span className="text-muted"> → </span>
                        <span className="truncate">{departmentOptionLabel(evaluation.evaluateeDepartment)}</span>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${scoreClass(evaluation.score)}`}>
                        {evaluation.score}
                      </span>
                    </div>
                    <div className="mt-2 text-xs font-semibold text-amber-700">повторов ранее: {repeats}</div>
                  </div>
                );
              })
            ) : (
              <div className="rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-muted">Повторяющихся проблем нет.</div>
            )}
          </div>
        </Panel>

        <Panel title="Динамика подразделений">
          <div className="max-h-[360px] space-y-2 overflow-auto p-4">
            {departmentTrends.length ? (
              departmentTrends.map((row) => (
                <div className="rounded-lg bg-slate-50 px-3 py-2" key={row.department.id}>
                  <div className="flex items-center justify-between gap-3">
                    <DepartmentLabel
                      department={row.department}
                      className="truncate font-semibold text-ink"
                      mutedClassName="mt-0 truncate text-xs text-muted"
                    />
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${
                        (row.averageDelta || 0) >= 0
                          ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
                          : "bg-red-50 text-red-700 ring-red-100"
                      }`}
                    >
                      {(row.averageDelta || 0) > 0 ? "+" : ""}
                      {(row.averageDelta || 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    сейчас {fixed(row.average)} · было {fixed(row.previousAverage)}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-muted">
                Для динамики нужен предыдущий период с оценками.
              </div>
            )}
          </div>
        </Panel>

        <Panel title="Динамика компании">
          <div className="space-y-4 p-4">
            {metrics.dynamics.slice(-6).map((point) => {
              const width = point.average ? `${Math.max(8, point.average * 10)}%` : "0%";
              return (
                <div key={point.period.id}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="truncate text-slate-700">{periodLabel(point.period)}</span>
                    <span className="font-semibold">{fixed(point.average)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100">
                    <div className="progress-fill h-2 rounded-full" style={{ width }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      </section>
    </AppShell>
  );
}

function AnalyticsCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="animate-soft-in interactive-card rounded-lg border border-line bg-white p-5">
      <div className="text-sm text-muted">{label}</div>
      <div className="animate-value-pop mt-2 text-3xl font-semibold text-ink">{value}</div>
      <div className="mt-1 text-xs text-muted">{hint}</div>
    </div>
  );
}

function GaugePanel({
  average,
  delta,
  filledCount,
  expectedCount
}: {
  average: number | null;
  delta: number | null;
  filledCount: number;
  expectedCount: number;
}) {
  const percent = average == null ? 0 : Math.max(0, Math.min(100, average * 10));
  const completionPercent = expectedCount ? Math.round((filledCount / expectedCount) * 100) : 0;

  return (
    <Panel title="Индекс взаимодействия">
      <div className="grid gap-4 p-5 sm:grid-cols-[160px_1fr] xl:grid-cols-1">
        <div className="flex items-center justify-center">
          <div
            className="relative flex h-40 w-40 items-center justify-center rounded-full"
            style={{
              background: `conic-gradient(#e30016 ${percent * 3.6}deg, #eef2f7 0deg)`
            }}
          >
            <div className="flex h-28 w-28 flex-col items-center justify-center rounded-full bg-white shadow-sm">
              <div className="animate-value-pop text-4xl font-semibold text-ink">{fixed(average)}</div>
              <div className="text-xs font-medium text-muted">из 10</div>
            </div>
          </div>
        </div>
        <div className="space-y-3">
          <VisualStat label="Динамика" value={deltaLabel(delta)} />
          <VisualStat label="Заполнение" value={`${completionPercent}%`} />
          <VisualStat label="Факт оценок" value={`${filledCount} из ${expectedCount}`} />
        </div>
      </div>
    </Panel>
  );
}

function TrendPanel({ points }: { points: Array<{ period: { id: string; month: number; year: number }; average: number | null }> }) {
  const chartWidth = 520;
  const chartHeight = 190;
  const paddingX = 34;
  const paddingY = 24;
  const values = points.map((point) => point.average);
  const scoredPoints = points.filter((point) => point.average != null);
  const minValue = Math.min(8, ...scoredPoints.map((point) => point.average as number));
  const maxValue = Math.max(10, ...scoredPoints.map((point) => point.average as number));
  const range = Math.max(0.1, maxValue - minValue);
  const xFor = (index: number) =>
    points.length <= 1 ? chartWidth / 2 : paddingX + (index * (chartWidth - paddingX * 2)) / (points.length - 1);
  const yFor = (value: number) =>
    chartHeight - paddingY - ((value - minValue) / range) * (chartHeight - paddingY * 2);
  const path = points
    .map((point, index) => {
      if (point.average == null) return "";
      const command = index === points.findIndex((item) => item.average != null) ? "M" : "L";
      return `${command} ${xFor(index).toFixed(1)} ${yFor(point.average).toFixed(1)}`;
    })
    .filter(Boolean)
    .join(" ");

  return (
    <Panel title="Тренд среднего балла">
      <div className="p-5">
        <div className="overflow-hidden rounded-lg bg-slate-50 p-3">
          <svg className="h-auto w-full" viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label="Динамика среднего балла">
            <defs>
              <linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#e30016" stopOpacity="0.16" />
                <stop offset="100%" stopColor="#e30016" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[8, 9, 10].map((line) => (
              <g key={line}>
                <line
                  stroke="#e2e6ee"
                  strokeDasharray="4 4"
                  x1={paddingX}
                  x2={chartWidth - paddingX}
                  y1={yFor(line)}
                  y2={yFor(line)}
                />
                <text fill="#667085" fontSize="11" x="4" y={yFor(line) + 4}>
                  {line}
                </text>
              </g>
            ))}
            {path ? (
              <>
                <path
                  d={`${path} L ${xFor(points.length - 1).toFixed(1)} ${chartHeight - paddingY} L ${xFor(0).toFixed(1)} ${chartHeight - paddingY} Z`}
                  fill="url(#trendFill)"
                />
                <path d={path} fill="none" stroke="#e30016" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
              </>
            ) : null}
            {points.map((point, index) =>
              point.average == null ? null : (
                <g key={point.period.id}>
                  <circle cx={xFor(index)} cy={yFor(point.average)} fill="#fff" r="6" stroke="#e30016" strokeWidth="3" />
                  <text fill="#18202b" fontSize="12" fontWeight="600" textAnchor="middle" x={xFor(index)} y={yFor(point.average) - 12}>
                    {point.average.toFixed(2)}
                  </text>
                </g>
              )
            )}
          </svg>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted sm:grid-cols-3">
          {points.map((point) => (
            <div className="rounded-lg bg-slate-50 px-2 py-1.5" key={point.period.id}>
              <div className="truncate">{periodLabel(point.period).replace("Оценка взаимодействия СП за ", "")}</div>
              <div className="font-semibold text-ink">{fixed(point.average)}</div>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function DistributionPanel({
  buckets,
  maxValue,
  total
}: {
  buckets: Array<{ label: string; description: string; value: number; className: string }>;
  maxValue: number;
  total: number;
}) {
  return (
    <Panel title="Распределение оценок">
      <div className="space-y-3 p-5">
        {buckets.map((bucket) => {
          const width = `${Math.max(bucket.value ? 8 : 2, (bucket.value / maxValue) * 100)}%`;
          const share = total ? Math.round((bucket.value / total) * 100) : 0;
          return (
            <div key={bucket.label}>
              <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <span className="font-semibold text-ink">{bucket.label}</span>
                  <span className="ml-2 text-xs text-muted">{bucket.description}</span>
                </div>
                <span className="shrink-0 text-xs font-semibold text-slate-700">
                  {bucket.value} · {share}%
                </span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                <div className={`h-3 rounded-full transition-all duration-500 ${bucket.className}`} style={{ width }} />
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function VisualStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-slate-50 px-3 py-2">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="mt-1 text-sm font-semibold text-ink">{value}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="animate-soft-in interactive-card min-w-0 rounded-lg border border-line bg-white">
      <div className="border-b border-line px-5 py-4">
        <h2 className="font-semibold text-ink">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function PriorityBadge({ value }: { value: number }) {
  if (value >= 12) return <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-red-100">высокий</span>;
  if (value >= 6) return <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-100">средний</span>;
  return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">низкий</span>;
}

function deltaLabel(value: number | null) {
  if (value == null) return "нет сравнения";
  if (Math.abs(value) < 0.005) return "без изменений";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)} к прошлому периоду`;
}
