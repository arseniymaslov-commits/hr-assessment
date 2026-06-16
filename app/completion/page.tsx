import { CheckCircle2, CircleAlert } from "lucide-react";
import { Role } from "@prisma/client";
import AppShell from "@/components/app-shell";
import PeriodFilter from "@/components/period-filter";
import { requireUser } from "@/lib/auth";
import { periodLabel } from "@/lib/format";
import { getPeriodMetrics } from "@/lib/metrics";

export default async function CompletionPage({
  searchParams
}: {
  searchParams: { period?: string };
}) {
  const user = await requireUser([Role.ADMIN, Role.ANALYST, Role.LEADER, Role.DIRECTOR, Role.VIEWER]);
  const metrics = await getPeriodMetrics(searchParams.period);
  const periodOptions = metrics.periods.map(({ id, month, year, status }) => ({
    id,
    month,
    year,
    status
  }));

  return (
    <AppShell user={user}>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Контроль заполнения</h1>
          <p className="mt-1 text-sm text-muted">
            {metrics.selectedPeriod ? periodLabel(metrics.selectedPeriod) : "Период не выбран"} ·{" "}
            {metrics.selectedPeriod?.status === "OPEN" ? "период открыт" : "период закрыт"}
          </p>
        </div>
        <PeriodFilter periods={periodOptions} selectedPeriodId={metrics.selectedPeriod?.id} />
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <StatusCard label="Всего ожидается" value={String(metrics.expectedCount)} />
        <StatusCard label="Заполнено" value={String(metrics.evaluations.length)} />
        <StatusCard label="Осталось" value={String(metrics.missingCount)} />
      </section>

      <section className="mt-6 rounded-lg border border-line bg-white">
        <div className="border-b border-line px-5 py-4">
          <h2 className="font-semibold text-ink">Статус по оценивающим подразделениям</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-5 py-3">Подразделение</th>
                <th className="px-5 py-3">Статус</th>
                  <th className="px-5 py-3">Заполнено</th>
                  <th className="px-5 py-3">Обязательно</th>
                  <th className="px-5 py-3">Осталось</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {metrics.completion.map((row) => (
                <tr key={row.department.id}>
                  <td className="px-5 py-4 font-medium text-ink">{row.department.name}</td>
                  <td className="px-5 py-4">
                    <span
                      className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-sm font-semibold ${
                        row.isComplete
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-red-50 text-red-700"
                      }`}
                    >
                      {row.isComplete ? <CheckCircle2 size={16} /> : <CircleAlert size={16} />}
                      {row.isComplete ? "Заполнено" : "Не заполнено"}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-slate-700">{row.filled}</td>
                  <td className="px-5 py-4 text-slate-700">{row.expected}</td>
                  <td className="px-5 py-4 text-slate-700">{row.missing}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}

function StatusCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-white p-5">
      <div className="text-sm text-muted">{label}</div>
      <div className="mt-2 text-3xl font-semibold text-ink">{value}</div>
    </div>
  );
}
