import { redirect } from "next/navigation";
import { defaultPathForRole, getCurrentUser } from "@/lib/auth";
import LoginForm from "@/components/login-form";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(defaultPathForRole(user.role));

  return (
    <main className="min-h-screen bg-surface px-4 py-10">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] w-full max-w-5xl items-center gap-8 md:grid-cols-[1.1fr_0.9fr]">
        <section>
          <p className="text-sm font-semibold uppercase tracking-wide text-brand">
            Ежемесячная оценка
          </p>
          <h1 className="mt-3 max-w-2xl text-4xl font-semibold tracking-normal text-ink md:text-5xl">
            Взаимодействие подразделений без ручных Excel-таблиц
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-muted">
            Руководители заполняют оценки, система проверяет комментарии по низким баллам,
            считает средние значения и показывает проблемные зоны.
          </p>
          <div className="mt-8 grid max-w-xl gap-3 text-sm text-slate-700 sm:grid-cols-3">
            <div className="rounded-lg border border-line bg-white p-4">
              <div className="text-2xl font-semibold text-ink">1-10</div>
              <div className="mt-1">Шкала оценки</div>
            </div>
            <div className="rounded-lg border border-line bg-white p-4">
              <div className="text-2xl font-semibold text-ink">&lt; 9</div>
              <div className="mt-1">Комментарий обязателен</div>
            </div>
            <div className="rounded-lg border border-line bg-white p-4">
              <div className="text-2xl font-semibold text-ink">MVP</div>
              <div className="mt-1">Готово к расширению</div>
            </div>
          </div>
        </section>
        <LoginForm />
      </div>
    </main>
  );
}
