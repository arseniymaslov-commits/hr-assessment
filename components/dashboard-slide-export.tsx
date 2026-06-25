"use client";

import Image from "next/image";
import { Download } from "lucide-react";
import { toPng } from "html-to-image";
import { useEffect, useRef, useState } from "react";

type LowScore = {
  id: string;
  score: number | null;
  comment: string | null;
  evaluatorName: string;
  evaluateeName: string;
};

type DashboardSlideExportProps = {
  departmentName: string;
  periodLabel: string;
  average: number | null;
  companyAverage: number | null;
  rank: number | null;
  totalDepartments: number;
  lowScores: LowScore[];
};

function fixed(value: number | null) {
  return value == null ? "—" : value.toFixed(2);
}

function scoreTone(value: number | null) {
  if (value == null) return "bg-slate-100 text-slate-600";
  if (value >= 9) return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (value >= 8) return "bg-amber-50 text-amber-700 ring-amber-200";
  return "bg-red-50 text-red-700 ring-red-200";
}

export default function DashboardSlideExport({
  departmentName,
  periodLabel,
  average,
  companyAverage,
  rank,
  totalDepartments,
  lowScores
}: DashboardSlideExportProps) {
  const previewRef = useRef<HTMLDivElement>(null);
  const slideRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [previewScale, setPreviewScale] = useState(1);
  const visibleLowScores = lowScores.slice(0, 6);

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
    if (!slideRef.current) return;
    setIsExporting(true);
    try {
      const dataUrl = await toPng(slideRef.current, {
        cacheBust: true,
        pixelRatio: 1.5,
        width: 1280,
        height: 720,
        backgroundColor: "#f8fafc"
      });
      const link = document.createElement("a");
      link.download = `dashboard-${departmentName.replace(/[\\/:*?"<>|]+/g, "-")}.png`;
      link.href = dataUrl;
      link.click();
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <section className="mt-6 rounded-lg border border-line bg-white p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold text-ink">Слайд для презентации</h2>
          <p className="mt-1 text-sm text-muted">Формат 16:9, готов для вставки в презентацию.</p>
        </div>
        <button
          className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg border border-brand/30 bg-white px-4 py-2 font-semibold text-brand transition hover:bg-brand/5 disabled:opacity-60"
          type="button"
          onClick={downloadPng}
          disabled={isExporting}
        >
          <Download size={18} /> {isExporting ? "Готовлю PNG" : "Скачать PNG"}
        </button>
      </div>

      <div className="mt-5 rounded-lg border border-line bg-slate-100 p-4">
        <div ref={previewRef} className="w-full overflow-hidden">
          <div className="relative" style={{ height: `${720 * previewScale}px` }}>
            <div className="origin-top-left" style={{ height: 720, transform: `scale(${previewScale})`, width: 1280 }}>
              <div
                ref={slideRef}
                className="relative h-[720px] w-[1280px] overflow-hidden bg-slate-50 text-slate-950"
              >
          <div className="absolute inset-x-0 top-0 h-3 bg-brand" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_86%_12%,rgba(227,6,19,0.10),transparent_28%),linear-gradient(135deg,#ffffff_0%,#f8fafc_54%,#eef2f7_100%)]" />

          <div className="relative flex h-full flex-col p-10">
            <header className="flex items-start justify-between gap-8">
              <div>
                <div className="text-[16px] font-semibold uppercase tracking-wide text-brand">
                  Дашборд взаимодействия
                </div>
                <h1 className="mt-2 max-w-[760px] text-[44px] font-bold leading-tight text-slate-950">
                  {departmentName}
                </h1>
                <div className="mt-2 text-[18px] text-slate-600">{periodLabel}</div>
              </div>
              <div className="flex h-[82px] w-[270px] items-center justify-end">
                <Image src="/rp-logo.png" alt="Red Petroleum" width={260} height={82} className="h-auto w-[260px]" priority />
              </div>
            </header>

            <main className="mt-7 grid min-h-0 flex-1 grid-cols-[380px_1fr] gap-7">
              <section className="flex min-h-0 flex-col rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                <div className="text-[18px] font-semibold text-slate-600">Средний балл отдела</div>
                <div className="mt-4 flex items-end gap-4">
                  <div className="text-[96px] font-bold leading-none text-brand">{fixed(average)}</div>
                  <div className="mb-3 rounded-full bg-slate-100 px-4 py-2 text-[16px] font-semibold text-slate-600">
                    из 10
                  </div>
                </div>
                <div className="mt-6 grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-slate-50 p-3">
                    <div className="text-[15px] leading-5 text-slate-500">Средний балл компании</div>
                    <div className="mt-2 text-[30px] font-bold text-slate-950">{fixed(companyAverage)}</div>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <div className="text-[15px] leading-5 text-slate-500">Место в рейтинге</div>
                    <div className="mt-2 text-[30px] font-bold text-slate-950">
                      {rank ? `${rank}/${totalDepartments}` : "—"}
                    </div>
                  </div>
                </div>
                <div className="mt-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-[15px] leading-6 text-slate-600">
                  Показатель отражает среднюю оценку взаимодействия подразделения за выбранный период.
                </div>
              </section>

              <section className="min-h-0 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between gap-4">
                  <h2 className="text-[26px] font-bold text-slate-950">Оценки 9 и ниже</h2>
                  <span className="rounded-full bg-red-50 px-3 py-1.5 text-[16px] font-semibold text-red-700 ring-1 ring-red-100">
                    {lowScores.length}
                  </span>
                </div>

                <div className="mt-4 space-y-2.5">
                  {visibleLowScores.length ? (
                    visibleLowScores.map((item) => (
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3" key={item.id}>
                        <div className="flex items-center gap-2.5">
                          <span className={`rounded-full px-2.5 py-1 text-[15px] font-bold ring-1 ${scoreTone(item.score)}`}>
                            {item.score ?? "—"}
                          </span>
                          <div className="min-w-0 flex-1 truncate text-[16px] font-semibold text-slate-900">
                            {item.evaluatorName}
                          </div>
                        </div>
                        <p className="mt-1.5 line-clamp-2 text-[15px] leading-5 text-slate-600">
                          {item.comment || "Комментарий не указан"}
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="flex h-[330px] items-center justify-center rounded-lg border border-emerald-100 bg-emerald-50 text-[24px] font-semibold text-emerald-700">
                      Оценок 9 и ниже нет
                    </div>
                  )}
                </div>

                {lowScores.length > visibleLowScores.length ? (
                  <div className="mt-3 text-[14px] font-semibold text-slate-500">
                    Еще {lowScores.length - visibleLowScores.length} комментариев доступны в системе.
                  </div>
                ) : null}
              </section>
            </main>

            <footer className="mt-5 flex items-center justify-between border-t border-slate-200 pt-4 text-[14px] text-slate-500">
              <span>Red Petroleum · Оценка взаимодействия подразделений</span>
              <span>PNG 16:9 · 1920×1080</span>
            </footer>
          </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
