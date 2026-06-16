"use client";

import { useState } from "react";
import { Send } from "lucide-react";

type Period = {
  id: string;
  month: number;
  year: number;
  status: "OPEN" | "CLOSED";
};

const months = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь"
];

function toDateTimeLocal(date: Date) {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

export default function LeaderLaunchPanel({
  departmentId,
  departmentName,
  periods
}: {
  departmentId: string;
  departmentName: string;
  periods: Period[];
}) {
  const [periodId, setPeriodId] = useState(periods.find((period) => period.status === "OPEN")?.id || periods[0]?.id || "");
  const [scheduledAt, setScheduledAt] = useState(toDateTimeLocal(new Date()));
  const [deadlineAt, setDeadlineAt] = useState(toDateTimeLocal(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)));
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function launch() {
    setLoading(true);
    setMessage("");
    const response = await fetch("/api/evaluation-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        periodId,
        evaluateeDepartmentId: departmentId,
        scheduledAt,
        deadlineAt
      })
    });
    const data = await response.json().catch(() => ({}));
    setMessage(response.ok ? data.message || "Оценка запущена." : data.error || "Не удалось запустить оценку.");
    setLoading(false);
  }

  if (!periods.length) return null;

  return (
    <section className="mb-6 mt-6 rounded-lg border border-red-100 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="font-semibold text-ink">Запуск оценки своего подразделения</h2>
          <p className="mt-1 text-sm text-muted">
            {departmentName}: выберите дату запуска и дедлайн. В момент запуска руководителям обязательных подразделений уйдет письмо со ссылкой на форму оценки.
          </p>
        </div>
        {message ? <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-brandDark">{message}</div> : null}
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_1fr_auto]">
        <select className="focus-ring rounded-lg border border-line px-3 py-2" value={periodId} onChange={(event) => setPeriodId(event.target.value)}>
          {periods.map((period) => (
            <option key={period.id} value={period.id}>
              {months[period.month - 1]} {period.year}
            </option>
          ))}
        </select>
        <label className="grid gap-1 text-sm text-muted">
          <span>Дата и время запуска</span>
          <input className="focus-ring rounded-lg border border-line px-3 py-2 text-ink" type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} />
        </label>
        <label className="grid gap-1 text-sm text-muted">
          <span>Дедлайн заполнения</span>
          <input className="focus-ring rounded-lg border border-line px-3 py-2 text-ink" type="datetime-local" value={deadlineAt} onChange={(event) => setDeadlineAt(event.target.value)} />
        </label>
        <button className="focus-ring inline-flex items-center justify-center gap-2 self-end rounded-lg bg-brand px-4 py-2 font-semibold text-white disabled:opacity-50" type="button" onClick={launch} disabled={loading}>
          <Send size={18} /> {loading ? "Запуск..." : "Запустить"}
        </button>
      </div>
    </section>
  );
}
