import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { defaultPathForRole, setSessionCookie } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = String(body?.email || "").trim().toLowerCase();
  const password = String(body?.password || "");
  const newPassword = String(body?.newPassword || "");

  if (!email) {
    return NextResponse.json({ error: "Укажите email" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) {
    return NextResponse.json({ error: "Пользователь не найден или отключен" }, { status: 401 });
  }

  if (!user.passwordHash || user.mustChangePassword) {
    if (!newPassword) {
      return NextResponse.json(
        { error: "Нужно задать пароль", action: "SET_PASSWORD" },
        { status: 409 }
      );
    }
    if (newPassword.length < 8) {
      return NextResponse.json({ error: "Пароль должен быть не короче 8 символов" }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hashPassword(newPassword),
        mustChangePassword: false
      }
    });
    setSessionCookie(user.id);
    return NextResponse.json({ ok: true, redirectTo: defaultPathForRole(user.role) });
  }

  if (!password || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json({ error: "Неверный email или пароль" }, { status: 401 });
  }

  setSessionCookie(user.id);
  return NextResponse.json({ ok: true, redirectTo: defaultPathForRole(user.role) });
}
