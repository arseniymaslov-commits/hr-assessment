"use client";

import { BarChart3, CheckCircle2, ChevronLeft, ChevronRight, ListChecks, MessageSquareWarning, Reply } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import RankingPlace from "@/components/ranking-place";
import EvaluationResponse from "@/components/evaluation-response";
import type { EvaluationResponseView } from "@/lib/evaluation-response";
import { MIN_RANKING_EVALUATIONS, isRankingEligible, sortRankingCandidates } from "@/lib/ranking";

type LowScore = {
  id: string;
  score: number | null;
  comment: string | null;
  evaluatorName: string;
  evaluateeName: string;
  response?: EvaluationResponseView | null;
  canRespond?: boolean;
};

type RankingItem = {
  id: string;
  name: string;
  average: number | null;
  count: number;
  lowCount: number;
  noInteractionCount: number;
  averageDelta?: number | null;
};

type CompletionItem = {
  id: string;
  name: string;
  filled: number;
  expected: number;
  missing: number;
  isComplete: boolean;
};

type DashboardPanelProps = {
  mode?: "company" | "department";
  title?: string;
  periodLabel: string;
  average?: number | null;
  companyAverage: number | null;
  rank?: number | null;
  totalDepartments?: number;
  lowScores: LowScore[];
  ranking: RankingItem[];
  insufficientData?: RankingItem[];
  completion: CompletionItem[];
  filledCount: number;
  missingCount: number;
  expectedCount: number;
};

type TabKey = "overview" | "ranking" | "comments" | "completion";

const tabs: Array<{ key: TabKey; label: string; icon: LucideIcon }> = [
  { key: "overview", label: "Обзор", icon: BarChart3 },
  { key: "ranking", label: "Рейтинг", icon: ListChecks },
  { key: "comments", label: "Комментарии", icon: MessageSquareWarning },
  { key: "completion", label: "Заполнение", icon: CheckCircle2 }
];

const rankingPageSize = 12;
const commentPageSize = 8;

function fixed(value: number | null | undefined) {
  return value == null ? "-" : value.toFixed(2);
}

function scoreTone(value: number | null | undefined) {
  if (value == null) return "bg-slate-100 text-slate-600 ring-slate-200";
  if (value >= 9) return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (value >= 8) return "bg-amber-50 text-amber-700 ring-amber-200";
  return "bg-red-50 text-red-700 ring-red-200";
}

function deltaText(value?: number | null) {
  if (value == null) return "нет сравнения";
  if (Math.abs(value) < 0.005) return "0.00";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
}

function splitDepartmentName(name: string) {
  const parts = name.split(" — ");
  if (parts.length < 2) return { code: name, description: "" };
  return { code: parts[0], description: parts.slice(1).join(" — ") };
}

function DepartmentName({ name, strong = true }: { name: string; strong?: boolean }) {
  const { code, description } = splitDepartmentName(name);

  return (
    <span className="min-w-0 flex-1" title={name}>
      <span className={`block truncate ${strong ? "font-semibold text-ink" : "font-medium text-slate-700"}`}>{code}</span>
      {description ? <span className="mt-0.5 block truncate text-xs font-normal text-muted">{description}</span> : null}
    </span>
  );
}

export default function CompanyDashboardPanel({
  mode = "company",
  title,
  periodLabel,
  average,
  companyAverage,
  rank,
  totalDepartments = 0,
  lowScores,
  ranking,
  insufficientData = [],
  completion,
  filledCount,
  missingCount,
  expectedCount
}: DashboardPanelProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const paginationScope = `${mode}:${title || ""}:${periodLabel}`;
  const [unansweredOnly, setUnansweredOnly] = useState(false);
  const [savedResponses, setSavedResponses] = useState<{ scope: string; items: Record<string, EvaluationResponseView> }>({ scope: paginationScope, items: {} });
  const [rankingPagination, setRankingPagination] = useState({ scope: paginationScope, page: 1 });
  const [commentPagination, setCommentPagination] = useState({ scope: paginationScope, page: 1 });
  if (rankingPagination.scope !== paginationScope) {
    setRankingPagination({ scope: paginationScope, page: 1 });
  }
  if (commentPagination.scope !== paginationScope) {
    setCommentPagination({ scope: paginationScope, page: 1 });
  }
  const isDepartment = mode === "department";
  const dashboardTitle = isDepartment
    ? `Дашборд подразделения: ${title || "-"}`
    : title || "Общий дашборд компании";
  const primaryAverage = isDepartment ? average : companyAverage;
  const completionPercent = expectedCount ? Math.round((filledCount / expectedCount) * 100) : 0;

  const rankedRows = useMemo(
    () =>
      ranking.filter(isRankingEligible).slice().sort(sortRankingCandidates),
    [ranking]
  );
  const insufficientRows = useMemo(
    () =>
      insufficientData.length
        ? insufficientData.slice().sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ru"))
        : ranking.filter((row) => !isRankingEligible(row)).slice().sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ru")),
    [insufficientData, ranking]
  );
  const problemRows = useMemo(
    () =>
      ranking
        .filter((row) => row.lowCount > 0 || row.noInteractionCount > 0)
        .slice()
        .sort((a, b) => b.lowCount + b.noInteractionCount - (a.lowCount + a.noInteractionCount)),
    [ranking]
  );
  const inactiveRows = useMemo(
    () =>
      completion
        .filter((row) => row.missing > 0)
        .slice()
        .sort((a, b) => b.missing - a.missing),
    [completion]
  );
  const overviewRanking = useMemo(() => {
    if (!isDepartment || !title) return rankedRows.slice(0, 6);
    const topRows = rankedRows.slice(0, 5);
    const currentRow = rankedRows.find((row) => row.name === title);
    if (currentRow && !topRows.some((row) => row.id === currentRow.id)) return [...topRows, currentRow];
    return topRows;
  }, [isDepartment, rankedRows, title]);

  const rankingPages = Math.max(1, Math.ceil(rankedRows.length / rankingPageSize));
  const comments = lowScores.map((item) => {
    const saved = savedResponses.scope === paginationScope ? savedResponses.items[item.id] : undefined;
    return saved && (!item.response || saved.updatedAt > item.response.updatedAt) ? { ...item, response: saved } : item;
  });
  const unansweredComments = comments.filter((item) => item.canRespond && !item.response);
  const responseCount = comments.filter((item) => item.canRespond).length;
  const visibleComments = unansweredOnly ? unansweredComments : comments;
  const commentPages = Math.max(1, Math.ceil(visibleComments.length / commentPageSize));
  const rankingPage = rankingPagination.scope === paginationScope ? Math.min(rankingPagination.page, rankingPages) : 1;
  const commentPage = commentPagination.scope === paginationScope ? Math.min(commentPagination.page, commentPages) : 1;
  const pagedRanking = rankedRows.slice((rankingPage - 1) * rankingPageSize, rankingPage * rankingPageSize);
  const pagedComments = visibleComments.slice((commentPage - 1) * commentPageSize, commentPage * commentPageSize);

  function selectCommentFilter(unanswered: boolean) {
    setUnansweredOnly(unanswered);
    setCommentPagination({ scope: paginationScope, page: 1 });
  }

  return (
    <section className="animate-soft-in mt-6 rounded-lg border border-line bg-white shadow-sm">
      <div className="border-b border-line px-5 py-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ink">{dashboardTitle}</h2>
            <p className="mt-1 text-sm text-muted">{periodLabel}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  className={`focus-ring inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                    isActive
                      ? "border-brand/30 bg-brand/5 text-brand shadow-sm"
                      : "border-line bg-white text-slate-700 hover:-translate-y-0.5 hover:bg-slate-50"
                  }`}
                  onClick={() => setActiveTab(tab.key)}
                >
                  <Icon size={16} />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {unansweredComments.length ? (
        <div className="flex flex-col gap-3 border-b border-amber-200 bg-amber-50 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Reply size={20} className="shrink-0 text-amber-800" aria-hidden="true" />
            <span className="text-sm font-semibold text-amber-900">Комментарии без ответа: {unansweredComments.length}</span>
          </div>
          {activeTab !== "comments" || !unansweredOnly ? (
            <button type="button" className="focus-ring response-attention inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-brand px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand/90" onClick={() => { selectCommentFilter(true); setActiveTab("comments"); }}>
              <Reply size={18} aria-hidden="true" />Ответить на комментарии
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="p-5">
        {activeTab === "overview" ? (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <OverviewCard
                label={isDepartment ? "Средний балл подразделения" : "Средний балл компании"}
                value={fixed(primaryAverage)}
                hint="по выбранному периоду"
              />
              <OverviewCard
                label={isDepartment ? "Место в рейтинге" : "Заполнение"}
                value={isDepartment ? (rank ? (
                  <span className="inline-flex items-center gap-2">
                    <RankingPlace place={rank} crownOnly />
                    <span>{rank}/{totalDepartments}</span>
                  </span>
                ) : "не участвует") : `${completionPercent}%`}
                hint={isDepartment ? `минимум ${MIN_RANKING_EVALUATIONS} оценки для рейтинга` : `${filledCount} из ${expectedCount}`}
              />
              <OverviewCard label="Оценки 9 и ниже" value={String(lowScores.length)} hint="с комментариями" />
              <OverviewCard label="Осталось оценок" value={String(missingCount)} hint="по обязательным связям" />
            </div>

            <div className="grid gap-5 lg:grid-cols-3">
              <CompactList
                title={isDepartment ? "Контекст рейтинга" : "Лидеры рейтинга"}
                rows={overviewRanking}
                emptyText="Нет данных для рейтинга"
                render={(row, index) => {
                  const rowIndex = rankedRows.findIndex((rankedRow) => rankedRow.id === row.id) + 1;
                  return (
                    <>
                      <RankingPlace place={rowIndex || index + 1} compact />
                      <DepartmentName name={row.name} strong={false} />
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${scoreTone(row.average)}`}>
                        {fixed(row.average)}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                        {row.count} оц.
                      </span>
                    </>
                  );
                }}
              />
              {isDepartment ? (
                <CompactList
                  title="Кто дал 9 и ниже"
                  rows={lowScores.slice(0, 8)}
                  emptyText="Оценок 9 и ниже нет"
                  render={(row) => (
                    <>
                      <DepartmentName name={row.evaluatorName} />
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${scoreTone(row.score)}`}>
                        {row.score ?? "-"}
                      </span>
                    </>
                  )}
                />
              ) : (
                <CompactList
                  title="Требуют внимания"
                  rows={problemRows.slice(0, 6)}
                  emptyText="Проблемных зон нет"
                  render={(row) => (
                    <>
                      <DepartmentName name={row.name} />
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-red-100">
                        9 и ниже: {row.lowCount}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                        нет: {row.noInteractionCount}
                      </span>
                    </>
                  )}
                />
              )}
              <CompactList
                title={isDepartment ? "Не оценили отдел" : "Не заполнено"}
                rows={inactiveRows.slice(0, 8)}
                emptyText="Все обязательные оценки заполнены"
                render={(row) => (
                  <>
                    <DepartmentName name={row.name} />
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-100">
                      осталось {row.missing}
                    </span>
                  </>
                )}
              />
            </div>
          </div>
        ) : null}

        {activeTab === "ranking" ? (
          <div>
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3">Место</th>
                    <th className="px-4 py-3">Подразделение</th>
                    <th className="px-4 py-3">Средний балл</th>
                    <th className="px-4 py-3">Динамика</th>
                    <th className="px-4 py-3">9 и ниже</th>
                    <th className="px-4 py-3">Нет взаимодействия</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {pagedRanking.map((row, index) => {
                    const isCurrent = isDepartment && row.name === title;
                    return (
                      <tr key={row.id} className={isCurrent ? "bg-brand/5" : undefined}>
                        <td className="px-4 py-3 font-semibold text-slate-700">
                          <RankingPlace place={(rankingPage - 1) * rankingPageSize + index + 1} />
                        </td>
                        <td className="px-4 py-3 font-medium text-ink"><span className="break-words">{row.name}</span></td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${scoreTone(row.average)}`}>
                            {fixed(row.average)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{deltaText(row.averageDelta)}</td>
                        <td className="px-4 py-3 text-slate-700">{row.lowCount}</td>
                        <td className="px-4 py-3 text-slate-700">{row.noInteractionCount}</td>
                      </tr>
                    );
                  })}
                  {!pagedRanking.length ? (
                    <tr>
                      <td className="px-4 py-8 text-center text-sm text-muted" colSpan={6}>
                        Пока нет подразделений с минимум {MIN_RANKING_EVALUATIONS} оценками для рейтинга.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <Pager page={rankingPage} pages={rankingPages} onPageChange={(page) => setRankingPagination({ scope: paginationScope, page })} />
            {insufficientRows.length ? (
              <div className="mt-4 rounded-lg border border-line bg-slate-50 p-4">
                <div className="font-semibold text-ink">Недостаточно данных для рейтинга</div>
                <div className="mt-1 text-sm text-muted">
                  Эти подразделения отображаются в сводке, но место не рассчитывается до {MIN_RANKING_EVALUATIONS} оценок.
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {insufficientRows.map((row) => (
                    <div className="rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-line" key={row.id}>
                      <DepartmentName name={row.name} />
                      <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted">
                        <span>оценок: {row.count}</span>
                        <span>средний: {fixed(row.average)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {activeTab === "comments" ? (
          <div>
            {responseCount ? (
              <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Фильтр комментариев">
                <button type="button" aria-pressed={!unansweredOnly} onClick={() => selectCommentFilter(false)} className={`focus-ring min-h-10 rounded-md border px-3 py-2 text-sm font-medium ${!unansweredOnly ? "border-brand/30 bg-brand/5 text-brand" : "border-line bg-white text-slate-700"}`}>Все комментарии · {comments.length}</button>
                <button type="button" aria-pressed={unansweredOnly} onClick={() => selectCommentFilter(true)} className={`focus-ring min-h-10 rounded-md border px-3 py-2 text-sm font-medium ${unansweredOnly ? "border-brand/30 bg-brand/5 text-brand" : "border-line bg-white text-slate-700"}`}>Без ответа · {unansweredComments.length}</button>
              </div>
            ) : null}
            <div className="max-h-[620px] overflow-auto rounded-lg border border-line bg-slate-50 p-3">
              {visibleComments.length ? (
                <div className="space-y-3">
                  {pagedComments.map((item) => (
                    <article className="rounded-lg border border-line bg-white p-4" key={item.id}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-sm font-semibold ring-1 ${scoreTone(item.score)}`}>
                          {item.score ?? "-"}
                        </span>
                        <span className="min-w-0 break-words font-semibold text-ink">{item.evaluatorName}</span>
                        <span className="text-muted">оценил</span>
                        <span className="min-w-0 break-words font-semibold text-ink">{item.evaluateeName}</span>
                      </div>
                      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
                        {item.comment || "Комментарий не указан"}
                      </p>
                      <EvaluationResponse evaluationId={item.id} response={item.response} canRespond={item.canRespond} onSaved={(response) => setSavedResponses((previous) => ({ scope: paginationScope, items: { ...(previous.scope === paginationScope ? previous.items : {}), [item.id]: response } }))} />
                    </article>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-5 py-8 text-center text-sm font-medium text-emerald-700">
                  {unansweredOnly ? "На все доступные вам комментарии дан ответ." : "Оценок 9 и ниже за период нет."}
                </div>
              )}
            </div>
            <Pager page={commentPage} pages={commentPages} onPageChange={(page) => setCommentPagination({ scope: paginationScope, page })} />
          </div>
        ) : null}

        {activeTab === "completion" ? (
          <div className="space-y-5">
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full min-w-[760px] text-left text-sm">
                <colgroup>
                  <col className="w-[52%]" />
                  <col className="w-[15%]" />
                  <col className="w-[13%]" />
                  <col className="w-[20%]" />
                </colgroup>
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-4 py-3">{isDepartment ? "Кто должен оценить отдел" : "Оценивающий отдел"}</th>
                    <th className="px-4 py-3">Заполнено</th>
                    <th className="px-4 py-3">Осталось</th>
                    <th className="px-4 py-3">Статус</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {completion.map((row) => (
                    <tr key={row.id} className={row.missing > 0 ? "bg-red-50/35" : undefined}>
                      <td className="px-4 py-3">
                        <DepartmentName name={row.name} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                        {row.filled} из {row.expected}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">{row.missing}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${
                            row.isComplete
                              ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                              : "bg-red-50 text-red-700 ring-red-100"
                          }`}
                        >
                          {row.isComplete ? "заполнено" : "ожидается"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <CompactList
              title={isDepartment ? "Кто еще не оценил" : "Кто бездействует"}
              rows={inactiveRows}
              emptyText="Все обязательные оценки заполнены"
              render={(row) => (
                <>
                  <DepartmentName name={row.name} />
                  <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-red-100">
                    осталось {row.missing}
                  </span>
                </>
              )}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}

function OverviewCard({ label, value, hint }: { label: string; value: ReactNode; hint: string }) {
  return (
    <div className="interactive-card rounded-lg border border-line bg-slate-50 p-4 hover:bg-white">
      <div className="text-sm text-muted">{label}</div>
      <div className="animate-value-pop mt-2 text-3xl font-semibold text-ink">{value}</div>
      <div className="mt-1 text-xs text-muted">{hint}</div>
    </div>
  );
}

function CompactList<T>({
  title,
  rows,
  emptyText,
  render
}: {
  title: string;
  rows: T[];
  emptyText: string;
  render: (row: T, index: number) => ReactNode;
}) {
  return (
    <div className="interactive-card rounded-lg border border-line bg-white">
      <div className="border-b border-line px-4 py-3 font-semibold text-ink">{title}</div>
      <div className="max-h-[360px] overflow-auto p-3">
        {rows.length ? (
          <div className="space-y-2">
            {rows.map((row, index) => (
              <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm" key={index}>
                {render(row, index)}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-muted">{emptyText}</div>
        )}
      </div>
    </div>
  );
}

function Pager({
  page,
  pages,
  onPageChange
}: {
  page: number;
  pages: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <div className="mt-3 flex items-center justify-end gap-2 text-sm text-muted">
      <button
        type="button"
        className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40"
        onClick={() => onPageChange(Math.max(1, page - 1))}
        disabled={page <= 1}
        aria-label="Предыдущая страница"
      >
        <ChevronLeft size={16} />
      </button>
      <span>
        {page} / {pages}
      </span>
      <button
        type="button"
        className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40"
        onClick={() => onPageChange(Math.min(pages, page + 1))}
        disabled={page >= pages}
        aria-label="Следующая страница"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
