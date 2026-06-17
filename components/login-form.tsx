"use client";

import { useState } from "react";
import { KeyRound, LogIn } from "lucide-react";

export default function LoginForm() {
  const [email, setEmail] = useState("admin@company.test");
  const [password, setPassword] = useState("demo123");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [needsPasswordSetup, setNeedsPasswordSetup] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    if (needsPasswordSetup && newPassword !== confirmPassword) {
      setLoading(false);
      setError("Пароли не совпадают");
      return;
    }

    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        newPassword: needsPasswordSetup ? newPassword : undefined
      })
    });

    setLoading(false);
    const data = await response.json().catch(() => ({}));
    if (response.ok) {
      window.location.href = data.redirectTo || "/dashboard";
      return;
    }

    if (response.status === 409 && data.action === "SET_PASSWORD") {
      setNeedsPasswordSetup(true);
      setError("Задайте пароль для входа в систему.");
      return;
    }
    setError(data.error || "Не удалось войти");
  }

  return (
    <section className="rounded-lg border border-line bg-white p-6 shadow-soft">
      <h2 className="text-xl font-semibold text-ink">
        {needsPasswordSetup ? "Задать пароль" : "Вход в систему"}
      </h2>
      <p className="mt-2 text-sm text-muted">
        {needsPasswordSetup
          ? "Это первый вход или администратор сбросил пароль."
          : "Введите корпоративный email и пароль."}
      </p>

      <form className="mt-6 space-y-4" onSubmit={submit}>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Email</span>
          <input
            className="focus-ring mt-1 w-full rounded-lg border border-line px-3 py-2"
            type="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setNeedsPasswordSetup(false);
            }}
            required
          />
        </label>

        {needsPasswordSetup ? (
          <>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Новый пароль</span>
              <input
                className="focus-ring mt-1 w-full rounded-lg border border-line px-3 py-2"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                minLength={8}
                required
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Повторите пароль</span>
              <input
                className="focus-ring mt-1 w-full rounded-lg border border-line px-3 py-2"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                minLength={8}
                required
              />
            </label>
          </>
        ) : (
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Пароль</span>
            <input
              className="focus-ring mt-1 w-full rounded-lg border border-line px-3 py-2"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
        )}

        {error ? <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-risk">{error}</div> : null}
        <button
          className="focus-ring inline-flex w-full items-center justify-center gap-2 rounded-lg bg-graphite px-4 py-2.5 font-semibold text-white transition hover:bg-ink disabled:opacity-60"
          disabled={loading}
          type="submit"
        >
          {needsPasswordSetup ? <KeyRound size={18} /> : <LogIn size={18} />}
          {loading ? "Подождите..." : needsPasswordSetup ? "Сохранить пароль и войти" : "Войти"}
        </button>
      </form>
    </section>
  );
}
