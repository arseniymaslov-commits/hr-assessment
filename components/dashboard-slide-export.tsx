"use client";

import Image from "next/image";
import { Download } from "lucide-react";
import { toPng } from "html-to-image";
import { useEffect, useMemo, useRef, useState } from "react";

type LowScore = {
  id: string;
  score: number | null;
  comment: string | null;
  evaluatorName: string;
  evaluateeName: string;
};

type RankingItem = {
  id: string;
  name: string;
  average: number | null;
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

function paginateComments(items: LowScore[]) {
  const pages: LowScore[][] = [];
  let page: LowScore[] = [];
  let units = 0;

  for (const item of items) {
    const commentLength = item.comment?.length || 0;
    const titleLength = item.evaluatorName.length + item.evaluateeName.length;
    const itemUnits = Math.max(4, Math.ceil((commentLength + titleLength) / 95) + 2);
    if (page.length && (page.length >= 4 || units + itemUnits > 22)) {
      pages.push(page);
      page = [];
      units = 0;
    }
    page.push(item);
    units += itemUnits;
  }

  if (page.length) pages.push(page);
  return pages;
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
  ranking,
  filledCount,
  missingCount,
  expectedCount
}: DashboardSlideExportProps) {
  const previewRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [previewScale, setPreviewScale] = useState(1);
  const commentPages = useMemo(() => paginateComments(lowScores), [lowScores]);
  const slideCount = 1 + commentPages.length;
  const topRanking = ranking.slice(0, 8);
  const completionPercent = expectedCount ? Math.round((filledCount / expectedCount) * 100) : 0;

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
          <p className="mt-1 text-sm text-muted">
            Формат 16:9. Сводка отдельно, комментарии вынесены на отдельные слайды без обрезания.
          </p>
        </div>
        <button
          className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg border border-brand/30 bg-white px-4 py-2 font-semibold text-brand transition hover:bg-brand/5 disabled:opacity-60"
          type="button"
          onClick={downloadPng}
          disabled={isExporting}
        >
          <Download size={18} /> {isExporting ? "Готовлю PNG" : `Скачать PNG (${slideCount})`}
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
                topRanking={topRanking}
                filledCount={filledCount}
                missingCount={missingCount}
                expectedCount={expectedCount}
                completionPercent={completionPercent}
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
      <div className="absolute inset-x-0 top-0 h-3 bg-brand" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_86%_12%,rgba(227,6,19,0.10),transparent_28%),linear-gradient(135deg,#ffffff_0%,#f8fafc_54%,#eef2f7_100%)]" />
      <div className="relative flex h-full flex-col p-10">{children}</div>
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
    <header className="flex items-start justify-between gap-8">
      <div>
        <div className="text-[16px] font-semibold uppercase tracking-wide text-brand">{label}</div>
        <h1 className="mt-2 max-w-[820px] text-[42px] font-bold leading-tight text-slate-950">{title}</h1>
        <div className="mt-2 text-[18px] text-slate-600">{periodLabel}</div>
      </div>
      <div className="flex h-[82px] w-[270px] items-center justify-end">
        <Image src="/rp-logo.png" alt="Red Petroleum" width={260} height={82} className="h-auto w-[260px]" priority />
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
  topRanking,
  filledCount,
  missingCount,
  expectedCount,
  completionPercent
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
  topRanking: RankingItem[];
  filledCount: number;
  missingCount: number;
  expectedCount: number;
  completionPercent: number;
}) {
  return (
    <SlideShell refCallback={refCallback}>
      <SlideHeader
        label={mode === "company" ? "Дашборд по компании" : "Дашборд взаимодействия"}
        title={title}
        periodLabel={periodLabel}
      />

      <main className="mt-8 grid min-h-0 flex-1 grid-cols-[390px_1fr] gap-7">
        <section className="flex min-h-0 flex-col rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-[18px] font-semibold text-slate-600">
            {mode === "company" ? "Средний балл компании" : "Средний балл отдела"}
          </div>
          <div className="mt-4 flex items-end gap-4">
            <div className="text-[96px] font-bold leading-none text-brand">{fixed(average)}</div>
            <div className="mb-3 rounded-full bg-slate-100 px-4 py-2 text-[16px] font-semibold text-slate-600">из 10</div>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <MetricTile label={mode === "company" ? "Оцениваемых отделов" : "Средний балл компании"} value={mode === "company" ? String(totalDepartments) : fixed(companyAverage)} />
            <MetricTile label={mode === "company" ? "Заполнение" : "Место в рейтинге"} value={mode === "company" ? `${completionPercent}%` : rank ? `${rank}/${totalDepartments}` : "-"} />
            <MetricTile label="Оценок 9 и ниже" value={String(lowScoresCount)} />
            <MetricTile label="Осталось оценок" value={String(missingCount)} />
          </div>
          <div className="mt-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-[15px] leading-6 text-slate-600">
            Ожидается оценок: {expectedCount}. Заполнено: {filledCount}. Осталось: {missingCount}.
          </div>
        </section>

        <section className="min-h-0 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-[26px] font-bold text-slate-950">
              {mode === "company" ? "Рейтинг подразделений" : "Контекст по компании"}
            </h2>
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[16px] font-semibold text-slate-600">
              топ {topRanking.length}
            </span>
          </div>
          <div className="mt-4 space-y-2.5">
            {topRanking.map((item, index) => (
              <div className="grid grid-cols-[46px_1fr_92px_92px] items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5" key={item.id}>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-[15px] font-bold text-slate-700 ring-1 ring-slate-200">
                  {index + 1}
                </div>
                <div className="truncate text-[16px] font-semibold text-slate-900">{item.name}</div>
                <div className={`justify-self-end rounded-full px-2.5 py-1 text-[14px] font-bold ring-1 ${scoreTone(item.average)}`}>
                  {fixed(item.average)}
                </div>
                <div className="justify-self-end text-[13px] font-semibold text-slate-500">
                  9↓: {item.lowCount}
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <SlideFooter />
    </SlideShell>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <div className="text-[14px] leading-5 text-slate-500">{label}</div>
      <div className="mt-2 text-[28px] font-bold text-slate-950">{value}</div>
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

      <main className="mt-7 min-h-0 flex-1 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-[26px] font-bold text-slate-950">Оценки 9 и ниже с комментариями</h2>
          <span className="rounded-full bg-red-50 px-3 py-1.5 text-[16px] font-semibold text-red-700 ring-1 ring-red-100">
            {pageNumber}/{totalPages || 1} · всего {totalComments}
          </span>
        </div>

        <div className="mt-5 space-y-3">
          {comments.length ? (
            comments.map((item) => (
              <article className="rounded-lg border border-slate-200 bg-slate-50 p-4" key={item.id}>
                <div className="flex items-center gap-3">
                  <span className={`rounded-full px-3 py-1.5 text-[16px] font-bold ring-1 ${scoreTone(item.score)}`}>
                    {item.score ?? "-"}
                  </span>
                  <div className="min-w-0 flex-1 truncate text-[17px] font-bold text-slate-900">
                    {mode === "company" ? `${item.evaluatorName} -> ${item.evaluateeName}` : item.evaluatorName}
                  </div>
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-[15px] leading-6 text-slate-700">
                  {item.comment || "Комментарий не указан"}
                </p>
              </article>
            ))
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

function SlideFooter() {
  return (
    <footer className="mt-5 flex items-center justify-between border-t border-slate-200 pt-4 text-[14px] text-slate-500">
      <span>Red Petroleum · Оценка взаимодействия подразделений</span>
      <span>PNG 16:9 · 1920x1080</span>
    </footer>
  );
}
