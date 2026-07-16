import { redirect } from "next/navigation";
import { defaultPathForRole, getCurrentUser } from "@/lib/auth";
import LoginForm from "@/components/login-form";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(defaultPathForRole(user.role));

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <img className="mx-auto h-14 w-auto" src="/rp-logo.png" alt="Red Petroleum" />
          <h1 className="mt-5 text-2xl font-semibold text-ink">
            Оценка взаимодействия подразделений
          </h1>
          <p className="mt-2 text-sm text-muted">
            Войдите под корпоративной почтой, чтобы заполнить оценку или посмотреть дашборд.
          </p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
