"use client";

import Image from "next/image";
import { Download } from "lucide-react";
import { toPng } from "html-to-image";
import { useEffect, useMemo, useRef, useState } from "react";
import { MIN_RANKING_EVALUATIONS } from "@/lib/ranking";
import RankingPlace from "@/components/ranking-place";
import type { EvaluationResponseView } from "@/lib/evaluation-response";
import { paginateComments } from "@/lib/presentation-comments";
import { presentationTrendDelta, type PresentationTrendPoint } from "@/lib/presentation-trend";
import { periodShortLabel } from "@/lib/format";

type LowScore = {
  id: string;
  score: number | null;
  comment: string | null;
  evaluatorName: string;
  evaluateeName: string;
  response?: EvaluationResponseView | null;
};

type RankingItem = {
  id: string;
  name: string;
  average: number | null;
  count: number;
  lowCount: number;
  noInteractionCount: number;
};

type DashboardSlideExportProps = {
  mode: "department" | "company";
  title: string;
  periodLabel: string;
  average: number | null;
  companyAverage: number | null;
  rank: number | null;
  totalDepartments: number;
  lowScores: LowScore[];
  ranking: RankingItem[];
  filledCount: number;
  missingCount: number;
  expectedCount: number;
  ratingCount: number;
  noInteractionCount: number;
  trendPoints: PresentationTrendPoint[];
};

function fixed(value: number | null) {
  return value == null ? "-" : value.toFixed(2);
}

function scoreTone(value: number | null) {
  if (value == null) return "bg-slate-100 text-slate-600";
  if (value >= 9) return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (value >= 8) return "bg-amber-50 text-amber-700 ring-amber-200";
  return "bg-red-50 text-red-700 ring-red-200";
}

function safeName(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, "-");
}

export default function DashboardSlideExport({
  mode,
  title,
  periodLabel,
  average,
  companyAverage,
  rank,
  totalDepartments,
  lowScores,
  filledCount,
  missingCount,
  expectedCount,
  ratingCount,
  noInteractionCount,
  trendPoints
}: DashboardSlideExportProps) {
  const previewRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [previewScale, setPreviewScale] = useState(1);
  const allCommentPages = useMemo(() => paginateComments(lowScores), [lowScores]);
  const summaryComments = allCommentPages[0] || [];
  const commentPages = allCommentPages.slice(1);
  const slideCount = 1 + commentPages.length;
  const completionPercent = expectedCount ? Math.round((filledCount / expectedCount) * 100) : 0;

  useEffect(() => {
    slideRefs.current.length = slideCount;
  }, [slideCount]);

  useEffect(() => {
    const element = previewRef.current;
    if (!element) return;
    const target = element;

    function updateScale() {
      setPreviewScale(Math.min(1, (target.clientWidth || 1280) / 1280));
    }

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  async function downloadPng() {
    setIsExporting(true);
    try {
      for (let index = 0; index < slideRefs.current.length; index += 1) {
        const slide = slideRefs.current[index];
        if (!slide) continue;
        const dataUrl = await toPng(slide, {
          cacheBust: true,
          pixelRatio: 1.5,
          width: 1280,
          height: 720,
          backgroundColor: "#f8fafc"
        });
        const link = document.createElement("a");
        link.download = `dashboard-${safeName(title)}-${String(index + 1).padStart(2, "0")}.png`;
        link.href = dataUrl;
        link.click();
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <section className="mt-6 rounded-lg border border-line bg-white p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold text-ink">
            {mode === "company" ? "Слайды по компании" : "Слайды отдела для презентации"}
          </h2>
        </div>
        <button
          className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg border border-brand/30 bg-white px-4 py-2 font-semibold text-brand transition hover:bg-brand/5 disabled:opacity-60"
          type="button"
          onClick={downloadPng}
          disabled={isExporting}
        >
          <Download size={18} /> {isExporting ? "Готовлю отчёт" : "Скачать для отчёта"}
        </button>
      </div>

      <div className="mt-5 rounded-lg border border-line bg-slate-100 p-4">
        <div ref={previewRef} className="w-full overflow-hidden">
          <div className="space-y-4">
            <SlideFrame previewScale={previewScale}>
              <SummarySlide
                refCallback={(node) => {
                  slideRefs.current[0] = node;
                }}
                mode={mode}
                title={title}
                periodLabel={periodLabel}
                average={average}
                companyAverage={companyAverage}
                rank={rank}
                totalDepartments={totalDepartments}
                lowScoresCount={lowScores.length}
                comments={summaryComments}
                remainingComments={commentPages.flat().length}
                filledCount={filledCount}
                missingCount={missingCount}
                expectedCount={expectedCount}
                completionPercent={completionPercent}
                ratingCount={ratingCount}
                noInteractionCount={noInteractionCount}
                trendPoints={trendPoints}
              />
            </SlideFrame>

            {commentPages.map((page, index) => (
              <SlideFrame previewScale={previewScale} key={`comments-${index}`}>
                <CommentsSlide
                  refCallback={(node) => {
                    slideRefs.current[index + 1] = node;
                  }}
                  mode={mode}
                  title={title}
                  periodLabel={periodLabel}
                  comments={page}
                  pageNumber={index + 1}
                  totalPages={commentPages.length}
                  totalComments={lowScores.length}
                />
              </SlideFrame>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function SlideFrame({
  previewScale,
  children
}: {
  previewScale: number;
  children: React.ReactNode;
}) {
  return (
    <div className="relative" style={{ height: `${720 * previewScale}px` }}>
      <div className="origin-top-left" style={{ height: 720, transform: `scale(${previewScale})`, width: 1280 }}>
        {children}
      </div>
    </div>
  );
}

function SlideShell({
  refCallback,
  children
}: {
  refCallback: (node: HTMLDivElement | null) => void;
  children: React.ReactNode;
}) {
  return (
    <div ref={refCallback} className="relative h-[720px] w-[1280px] overflow-hidden bg-slate-50 text-slate-950">
      <div className="absolute inset-x-0 top-0 h-2 bg-brand" />
      <div className="relative flex h-full flex-col p-8">{children}</div>
    </div>
  );
}

function SlideHeader({
  label,
  title,
  periodLabel
}: {
  label: string;
  title: string;
  periodLabel: string;
}) {
  return (
    <header className="flex h-[110px] shrink-0 items-start justify-between gap-6">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold uppercase text-brand">{label}</div>
        <h1 className={`mt-1 break-words font-bold leading-tight text-slate-950 ${title.length > 60 ? "text-[26px]" : "text-[34px]"}`}>{title}</h1>
        <p className="mt-1 text-[15px] text-slate-500">{periodLabel}</p>
      </div>
      <div className="flex h-[70px] w-[210px] shrink-0 items-center justify-end">
        <Image src="/rp-logo.png" alt="Red Petroleum" width={200} height={64} className="h-auto w-[200px]" priority />
      </div>
    </header>
  );
}

function SummarySlide({
  refCallback,
  mode,
  title,
  periodLabel,
  average,
  companyAverage,
  rank,
  totalDepartments,
  lowScoresCount,
  comments,
  remainingComments,
  filledCount,
  missingCount,
  expectedCount,
  completionPercent,
  ratingCount,
  noInteractionCount,
  trendPoints
}: {
  refCallback: (node: HTMLDivElement | null) => void;
  mode: "department" | "company";
  title: string;
  periodLabel: string;
  average: number | null;
  companyAverage: number | null;
  rank: number | null;
  totalDepartments: number;
  lowScoresCount: number;
  comments: LowScore[];
  remainingComments: number;
  filledCount: number;
  missingCount: number;
  expectedCount: number;
  completionPercent: number;
  ratingCount: number;
  noInteractionCount: number;
  trendPoints: PresentationTrendPoint[];
}) {
  return (
    <SlideShell refCallback={refCallback}>
      <SlideHeader
        label={mode === "company" ? "Дашборд по компании" : "Дашборд взаимодействия"}
        title={title}
        periodLabel={periodLabel}
      />

      <main className="mt-3 grid min-h-0 flex-1 grid-cols-[300px_1fr] gap-6">
        <section className="min-h-0 border-r border-slate-200 pr-6">
          <div className="text-[16px] font-semibold text-slate-600">
            {mode === "company" ? "Средний балл компании" : "Средний балл отдела"}
          </div>
          <div className="mt-2 flex items-baseline gap-3">
            <div className="text-[56px] font-bold leading-none text-slate-950">{fixed(average)}</div>
            {average != null ? <span className="text-[16px] text-slate-500">из 10</span> : null}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
            <MetricTile label={mode === "company" ? "Оцениваемых отделов" : "Средний балл компании"} value={mode === "company" ? String(totalDepartments) : fixed(companyAverage)} />
            <MetricTile label={mode === "company" ? "Заполнение" : "Место в рейтинге"} value={mode === "company" ? `${completionPercent}%` : rank ? (
              <span className="inline-flex items-center gap-2">
                <RankingPlace place={rank} crownOnly />
                <span>{rank}/{totalDepartments}</span>
              </span>
            ) : "нет места"} />
            <MetricTile label="Получено оценок" value={String(ratingCount)} />
            <MetricTile label="Нет взаимодействия" value={String(noInteractionCount)} />
          </div>
          <SlideTrend points={trendPoints} />
          <div className="mt-2 text-[12px] leading-4 text-slate-500">
            {expectedCount > 0 ? <>Обязательные: {filledCount}/{expectedCount}. Осталось: {missingCount}.</> : null}
            {mode === "department" && !rank ? <p>Для рейтинга нужно минимум {MIN_RANKING_EVALUATIONS} оценки.</p> : null}
          </div>
        </section>

        <section className="min-h-0">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-[22px] font-bold text-slate-950">Комментарии и ответы</h2>
            <span className="text-[14px] font-medium text-slate-500">
              Оценок 9 и ниже: {lowScoresCount}
            </span>
          </div>
          <div className="mt-3 space-y-2">
            {comments.length ? (
              comments.map((item) => <SlideComment key={item.id} item={item} mode={mode} />)
            ) : (
              <div className={`flex h-[300px] flex-col items-center justify-center gap-2 border-y text-[20px] font-semibold ${ratingCount ? "border-emerald-200 text-emerald-700" : "border-slate-200 text-slate-500"}`}>
                {ratingCount ? "Оценок 9 и ниже нет" : "Пока нет оценок"}
                {!ratingCount ? <span className="text-[14px] font-normal">Недостаточно данных для выводов</span> : null}
              </div>
            )}
            {remainingComments ? (
              <div className="text-[12px] text-slate-500">
                Продолжение комментариев и ответов на следующих слайдах.
              </div>
            ) : null}
          </div>
        </section>
      </main>

      <SlideFooter />
    </SlideShell>
  );
}

function MetricTile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[12px] leading-4 text-slate-500">{label}</div>
      <div className="mt-1 text-[20px] font-bold leading-tight text-slate-950">{value}</div>
    </div>
  );
}

function SlideTrend({ points }: { points: PresentationTrendPoint[] }) {
  const delta = presentationTrendDelta(points);
  const values = points.flatMap((point) => point.average == null ? [] : [point.average]);
  const minimum = Math.max(1, Math.min(9, Math.floor(Math.min(...values) * 2) / 2 - 0.5));
  const width = 274;
  const height = 140;
  const xFor = (index: number) => points.length <= 1 ? width / 2 : 32 + index * 222 / (points.length - 1);
  const yFor = (value: number) => 114 - (value - minimum) / (10 - minimum) * 84;
  const roundedDelta = delta == null ? null : Math.round(delta * 100) / 100;
  const deltaText = roundedDelta == null ? "Нет сравнения" : `${roundedDelta > 0 ? "+" : ""}${roundedDelta.toFixed(2)} к прошлому периоду`;
  return (
    <div className="mt-4 border-t border-slate-200 pt-3">
      <h2 className="text-[15px] font-semibold text-slate-900">Динамика по месяцам</h2>
      <div className={`mt-1 text-[12px] font-medium ${delta == null || Math.abs(delta) < 0.005 ? "text-slate-500" : delta > 0 ? "text-emerald-700" : "text-red-700"}`}>{deltaText}</div>
      {values.length ? (
        <svg className="mt-1 h-[140px] w-full" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Динамика среднего балла. ${points.map((point) => `${periodShortLabel(point.period)}: ${fixed(point.average)}, оценок ${point.count}`).join("; ")}`}>
          {[minimum, (minimum + 10) / 2, 10].map((value) => (
            <g key={value}>
              <line x1="32" x2="266" y1={yFor(value)} y2={yFor(value)} stroke="#e2e8f0" strokeDasharray="3 3" />
              <text x="0" y={yFor(value) + 4} fill="#64748b" fontSize="10">{value.toFixed(1)}</text>
            </g>
          ))}
          {points.map((point, index) => {
            if (point.average == null) return null;
            const previous = points[index - 1];
            return (
              <g key={point.period.id}>
                {previous?.average != null ? <line x1={xFor(index - 1)} x2={xFor(index)} y1={yFor(previous.average)} y2={yFor(point.average)} stroke="#e30613" strokeWidth="2.5" /> : null}
                <circle cx={xFor(index)} cy={yFor(point.average)} r="4" fill="#fff" stroke="#e30613" strokeWidth="2" />
                <text x={xFor(index)} y={yFor(point.average) - 10} textAnchor="middle" fontSize="11" fontWeight="600" fill="#0f172a">{point.average.toFixed(2)}</text>
              </g>
            );
          })}
        </svg>
      ) : <div className="flex h-[140px] items-center text-[14px] text-slate-500">Пока нет оценок для динамики</div>}
      <div className="grid gap-1 text-center text-[10px] leading-4 text-slate-500" style={{ gridTemplateColumns: `repeat(${Math.max(1, points.length)}, minmax(0, 1fr))` }}>
        {points.map((point) => (
          <div key={point.period.id}>
            <div>{String(point.period.month).padStart(2, "0")}.{String(point.period.year).slice(-2)}</div>
            <div className="whitespace-nowrap" title={`Оценок: ${point.count}`}>{point.average == null ? "-" : `${point.count} оц.`}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CommentsSlide({
  refCallback,
  mode,
  title,
  periodLabel,
  comments,
  pageNumber,
  totalPages,
  totalComments
}: {
  refCallback: (node: HTMLDivElement | null) => void;
  mode: "department" | "company";
  title: string;
  periodLabel: string;
  comments: LowScore[];
  pageNumber: number;
  totalPages: number;
  totalComments: number;
}) {
  return (
    <SlideShell refCallback={refCallback}>
      <SlideHeader
        label={mode === "company" ? "Комментарии по компании" : "Комментарии к отделу"}
        title={title}
        periodLabel={periodLabel}
      />

      <main className="mt-3 min-h-0 flex-1">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-[22px] font-bold text-slate-950">Комментарии и ответы: продолжение</h2>
          <span className="text-[14px] font-medium text-slate-500">
            {pageNumber}/{totalPages || 1} · всего {totalComments}
          </span>
        </div>

        <div className="mt-3 space-y-2">
          {comments.length ? (
            comments.map((item) => <SlideComment key={item.id} item={item} mode={mode} />)
          ) : (
            <div className="flex h-[420px] items-center justify-center rounded-lg border border-emerald-100 bg-emerald-50 text-[24px] font-semibold text-emerald-700">
              Оценок 9 и ниже нет
            </div>
          )}
        </div>
      </main>

      <SlideFooter />
    </SlideShell>
  );
}

function SlideComment({ item, mode }: { item: LowScore; mode: "department" | "company" }) {
  return (
    <article className="rounded-md border border-slate-200 bg-white px-3 py-2">
      <div className="flex items-start gap-2">
        <span className={`shrink-0 rounded-md px-2 py-0.5 text-[14px] font-bold ring-1 ${scoreTone(item.score)}`}>{item.score ?? "-"}</span>
        <div className="min-w-0 flex-1 break-words text-[14px] font-semibold leading-5 text-slate-900">
          {mode === "company" ? `${item.evaluatorName} -> ${item.evaluateeName}` : item.evaluatorName}
        </div>
      </div>
      <div className={`mt-1.5 grid gap-3 text-[14px] leading-5 ${item.response ? "grid-cols-[1.2fr_1fr]" : "grid-cols-1"}`}>
        <p className="min-w-0 whitespace-pre-wrap text-slate-700 [overflow-wrap:anywhere]">{item.comment || "Комментарий не указан"}</p>
        {item.response ? (
          <div className="min-w-0 border-l-2 border-slate-300 pl-3">
            <div className="text-[12px] font-semibold text-slate-500">Ответ подразделения</div>
            <p className="whitespace-pre-wrap text-slate-600 [overflow-wrap:anywhere]">{item.response.text}</p>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function SlideFooter() {
  return (
    <footer className="mt-3 flex shrink-0 items-center justify-between border-t border-slate-200 pt-3 text-[12px] text-slate-500">
      <span>Red Petroleum · Оценка взаимодействия подразделений</span>
      <span>PNG 16:9 · 1920x1080</span>
    </footer>
  );
}
