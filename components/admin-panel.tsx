"use client";

import { useState } from "react";
import { Plus, RefreshCw, RotateCcw, Send } from "lucide-react";
import DepartmentLabel from "@/components/department-label";
import { departmentOptionLabel } from "@/lib/department-decodings";
import { periodLabel } from "@/lib/format";

type Department = {
  id: string;
  name: string;
  shortName: string;
};

type Period = {
  id: string;
  month: number;
  year: number;
  status: "OPEN" | "CLOSED";
};

type User = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "ANALYST" | "LEADER" | "DASHBOARD_VIEWER" | "DIRECTOR" | "VIEWER";
  position?: string | null;
  departmentId?: string | null;
  mustChangePassword?: boolean;
  isActive?: boolean;
  receivesNotifications?: boolean;
};

type Criterion = {
  id: string;
  name: string;
  description?: string | null;
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

const roles = [
  ["ADMIN", "Администратор"],
  ["ANALYST", "Аналитик"],
  ["LEADER", "Руководитель / заместитель"],
  ["DASHBOARD_VIEWER", "Только просмотр дашборда"],
  ["DIRECTOR", "Директор"],
  ["VIEWER", "Просмотр"]
] as const;

function toDateTimeLocal(date: Date) {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

export default function AdminPanel({
  departments,
  evaluateeDepartments,
  periods,
  users,
  criteria
}: {
  departments: Department[];
  evaluateeDepartments: Department[];
  periods: Period[];
  users: User[];
  criteria: Criterion[];
}) {
  const [departmentName, setDepartmentName] = useState("");
  const [shortName, setShortName] = useState("");
  const [criterionName, setCriterionName] = useState("");
  const [criterionDescription, setCriterionDescription] = useState("");
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userRole, setUserRole] = useState<User["role"]>("LEADER");
  const [userPosition, setUserPosition] = useState("Руководитель");
  const [userDepartmentId, setUserDepartmentId] = useState(departments[0]?.id || "");
  const [userReceivesNotifications, setUserReceivesNotifications] = useState(true);
  const [launchDepartmentId, setLaunchDepartmentId] = useState(evaluateeDepartments[0]?.id || "");
  const [launchPeriodId, setLaunchPeriodId] = useState(
    periods.find((period) => period.status === "OPEN")?.id || periods[0]?.id || ""
  );
  const [launchScheduledAt, setLaunchScheduledAt] = useState(toDateTimeLocal(new Date()));
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function request(url: string, options: RequestInit) {
    if (pending) return;
    setPending(true);
    setMessage("Выполняется...");
    try {
      const response = await fetch(url, {
        ...options,
        headers: { "Content-Type": "application/json", ...(options.headers || {}) }
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(data.error || "Операция не выполнена.");
        return;
      }
      setMessage(data.message || "Готово.");
      window.location.reload();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={`space-y-6 ${pending ? "cursor-progress" : ""}`}>
      {message ? <div className="rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-700">{message}</div> : null}

      <section className="grid gap-6 xl:grid-cols-2">
        <form
          className="rounded-lg border border-line bg-white p-5"
          onSubmit={(event) => {
            event.preventDefault();
            request("/api/admin/departments", {
              method: "POST",
              body: JSON.stringify({ name: departmentName, shortName })
            });
          }}
        >
          <h2 className="font-semibold text-ink">Подразделения</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_140px_auto]">
            <input className="focus-ring rounded-lg border border-line px-3 py-2" placeholder="Название" value={departmentName} onChange={(event) => setDepartmentName(event.target.value)} />
            <input className="focus-ring rounded-lg border border-line px-3 py-2" placeholder="Кратко" value={shortName} onChange={(event) => setShortName(event.target.value)} />
            <button className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg border border-brand/30 bg-white px-4 py-2 font-semibold text-brand transition hover:bg-brand/5">
              <Plus size={18} /> Добавить
            </button>
          </div>
          <div className="mt-5 divide-y divide-line">
            {departments.map((department) => (
              <div className="flex items-center justify-between gap-3 py-3" key={department.id}>
                <DepartmentLabel department={department} />
                <button className="focus-ring rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-risk transition hover:bg-red-50/60" type="button" onClick={() => request(`/api/admin/departments/${department.id}`, { method: "DELETE" })}>
                  Удалить
                </button>
              </div>
            ))}
          </div>
        </form>

        <form
          className="rounded-lg border border-line bg-white p-5"
          onSubmit={(event) => {
            event.preventDefault();
            request("/api/admin/criteria", {
              method: "POST",
              body: JSON.stringify({ name: criterionName, description: criterionDescription })
            });
          }}
        >
          <h2 className="font-semibold text-ink">Критерии оценки</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <input className="focus-ring rounded-lg border border-line px-3 py-2" placeholder="Название критерия" value={criterionName} onChange={(event) => setCriterionName(event.target.value)} />
            <input className="focus-ring rounded-lg border border-line px-3 py-2" placeholder="Описание" value={criterionDescription} onChange={(event) => setCriterionDescription(event.target.value)} />
            <button className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg border border-brand/30 bg-white px-4 py-2 font-semibold text-brand transition hover:bg-brand/5">
              <Plus size={18} /> Добавить
            </button>
          </div>
          <div className="mt-5 divide-y divide-line">
            {criteria.map((criterion) => (
              <div className="flex items-center justify-between gap-3 py-3" key={criterion.id}>
                <div>
                  <div className="font-medium">{criterion.name}</div>
                  <div className="text-sm text-muted">{criterion.description || "Без описания"}</div>
                </div>
                <button className="focus-ring rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-risk transition hover:bg-red-50/60" type="button" onClick={() => request(`/api/admin/criteria/${criterion.id}`, { method: "DELETE" })}>
                  Удалить
                </button>
              </div>
            ))}
          </div>
        </form>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <form
          className="rounded-lg border border-line bg-white p-5"
          onSubmit={(event) => {
            event.preventDefault();
            request("/api/admin/periods", { method: "POST", body: JSON.stringify({ month, year }) });
          }}
        >
          <h2 className="font-semibold text-ink">Периоды оценки</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_120px_auto]">
            <select className="focus-ring rounded-lg border border-line px-3 py-2" value={month} onChange={(event) => setMonth(Number(event.target.value))}>
              {months.map((label, index) => <option key={label} value={index + 1}>{label}</option>)}
            </select>
            <input className="focus-ring rounded-lg border border-line px-3 py-2" type="number" value={year} onChange={(event) => setYear(Number(event.target.value))} />
            <button className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg border border-brand/30 bg-white px-4 py-2 font-semibold text-brand transition hover:bg-brand/5">
              <Plus size={18} /> Открыть
            </button>
          </div>
          <div className="mt-5 divide-y divide-line">
            {periods.map((period) => (
              <div className="flex items-center justify-between gap-3 py-3" key={period.id}>
                <div>
                  <div className="font-medium">{periodLabel(period)}</div>
                  <div className="text-sm text-muted">{period.status === "OPEN" ? "Открыт" : "Закрыт"}</div>
                </div>
                <button className="focus-ring inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm transition hover:border-slate-300 hover:bg-slate-50" type="button" onClick={() => request(`/api/admin/periods/${period.id}`, { method: "PATCH", body: JSON.stringify({ status: period.status === "OPEN" ? "CLOSED" : "OPEN" }) })}>
                  <RefreshCw size={16} /> {period.status === "OPEN" ? "Закрыть" : "Открыть"}
                </button>
              </div>
            ))}
          </div>
        </form>

        <section className="rounded-lg border border-line bg-white p-5">
          <h2 className="font-semibold text-ink">Запуск оценки отдела</h2>
          <p className="mt-1 text-sm text-muted">Запускает оценку выбранного отдела или планирует ее на календарную дату. Оценки доступны до закрытия периода администратором.</p>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <select className="focus-ring rounded-lg border border-line px-3 py-2" value={launchDepartmentId} onChange={(event) => setLaunchDepartmentId(event.target.value)}>
              {evaluateeDepartments.map((department) => (
                <option key={department.id} value={department.id}>
                  {departmentOptionLabel(department)}
                </option>
              ))}
            </select>
            <select className="focus-ring rounded-lg border border-line px-3 py-2" value={launchPeriodId} onChange={(event) => setLaunchPeriodId(event.target.value)}>
              {periods.map((period) => <option key={period.id} value={period.id}>{periodLabel(period)}</option>)}
            </select>
            <label className="grid gap-1 text-sm text-muted">
              <span>Дата и время запуска</span>
              <input className="focus-ring rounded-lg border border-line px-3 py-2 text-ink" type="datetime-local" value={launchScheduledAt} onChange={(event) => setLaunchScheduledAt(event.target.value)} />
            </label>
            <div className="rounded-lg border border-line bg-slate-50 px-3 py-2 text-sm text-muted">
              Без дедлайна: период закрывается вручную в блоке «Периоды оценки».
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg border border-brand/30 bg-white px-3 py-2 text-sm font-semibold text-brand transition hover:bg-brand/5" type="button" onClick={() => request("/api/evaluation-requests", { method: "POST", body: JSON.stringify({ evaluateeDepartmentId: launchDepartmentId, periodId: launchPeriodId, scheduledAt: launchScheduledAt }) })}>
              <Send size={18} /> Запустить
            </button>
            <button className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold text-ink transition hover:border-slate-300 hover:bg-slate-50" type="button" onClick={() => request("/api/evaluation-requests/bulk", { method: "POST", body: JSON.stringify({ periodId: launchPeriodId, scheduledAt: launchScheduledAt }) })}>
              <Send size={18} /> Все СП
            </button>
            <button className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-semibold text-amber-800 transition hover:bg-amber-50" type="button" onClick={() => request("/api/admin/notifications/escalation", { method: "POST", body: JSON.stringify({ periodId: launchPeriodId }) })}>
              <Send size={18} /> Эскалация руководителям
            </button>
          </div>
        </section>
      </section>

      <section className="rounded-lg border border-line bg-white p-5">
        <h2 className="font-semibold text-ink">Пользователи и роли</h2>
        <form className="mt-4 flex flex-wrap items-stretch gap-3" onSubmit={(event) => {
          event.preventDefault();
          request("/api/admin/users", {
            method: "POST",
            body: JSON.stringify({ name: userName, email: userEmail, role: userRole, position: userPosition, departmentId: userDepartmentId, receivesNotifications: userReceivesNotifications })
          });
        }}>
          <input className="focus-ring min-w-[180px] flex-1 rounded-lg border border-line px-3 py-2" placeholder="ФИО" value={userName} onChange={(event) => setUserName(event.target.value)} />
          <input className="focus-ring min-w-[190px] flex-1 rounded-lg border border-line px-3 py-2" placeholder="Email" type="email" value={userEmail} onChange={(event) => setUserEmail(event.target.value)} />
          <select className="focus-ring min-w-[220px] flex-1 rounded-lg border border-line px-3 py-2" value={userRole} onChange={(event) => setUserRole(event.target.value as User["role"])}>
            {roles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <input className="focus-ring min-w-[180px] flex-1 rounded-lg border border-line px-3 py-2" placeholder="Должность" value={userPosition} onChange={(event) => setUserPosition(event.target.value)} disabled={userRole !== "LEADER"} />
          <select className="focus-ring min-w-[190px] flex-1 rounded-lg border border-line px-3 py-2 disabled:bg-slate-100" value={userDepartmentId} onChange={(event) => setUserDepartmentId(event.target.value)} disabled={userRole !== "LEADER"}>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {departmentOptionLabel(department)}
              </option>
            ))}
          </select>
          <label className="flex shrink-0 items-center justify-center gap-2 rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink">
            <input className="h-4 w-4" type="checkbox" checked={userReceivesNotifications} onChange={(event) => setUserReceivesNotifications(event.target.checked)} />
            Рассылка
          </label>
          <button className="focus-ring shrink-0 rounded-lg border border-brand/30 bg-white px-4 py-2 font-semibold text-brand transition hover:bg-brand/5">Сохранить</button>
        </form>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Имя</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Роль</th>
                <th className="px-4 py-3">Должность</th>
                <th className="px-4 py-3">Подразделение</th>
                <th className="px-4 py-3">Рассылка</th>
                <th className="px-4 py-3">Пароль</th>
                <th className="px-4 py-3">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {users.map((user) => (
                <tr key={user.id} className={user.isActive === false ? "opacity-50" : ""}>
                  <td className="px-4 py-3 font-medium">{user.name}</td>
                  <td className="px-4 py-3">{user.email}</td>
                  <td className="px-4 py-3">{roles.find(([value]) => value === user.role)?.[1] || user.role}</td>
                  <td className="px-4 py-3">{user.position || "—"}</td>
                  <td className="px-4 py-3">
                    {departments.find((department) => department.id === user.departmentId) ? (
                      <DepartmentLabel department={departments.find((department) => department.id === user.departmentId)!} />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      className={`focus-ring rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${
                        user.receivesNotifications === false
                          ? "border-line text-muted hover:bg-slate-50"
                          : "border-emerald-200 bg-emerald-50 text-emerald-700"
                      }`}
                      type="button"
                      onClick={() => request(`/api/admin/users/${user.id}`, { method: "PATCH", body: JSON.stringify({ receivesNotifications: user.receivesNotifications === false }) })}
                    >
                      {user.receivesNotifications === false ? "Выключена" : "Включена"}
                    </button>
                  </td>
                  <td className="px-4 py-3">{user.mustChangePassword ? "Нужно задать" : "Задан"}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button className="focus-ring inline-flex items-center gap-1 rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs font-semibold transition hover:border-slate-300 hover:bg-slate-50" type="button" onClick={() => request(`/api/admin/users/${user.id}/reset-password`, { method: "POST" })}>
                        <RotateCcw size={14} /> Сбросить пароль
                      </button>
                      <button className="focus-ring rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-risk transition hover:bg-red-50/60" type="button" onClick={() => request(`/api/admin/users/${user.id}`, { method: "DELETE" })}>
                        Отключить
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
