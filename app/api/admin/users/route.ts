import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const assignableRoles = new Set<Role>([
  Role.ADMIN,
  Role.ANALYST,
  Role.LEADER,
  Role.DASHBOARD_VIEWER,
  Role.DIRECTOR,
  Role.VIEWER
]);

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (user?.role !== Role.ADMIN) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const name = String(body?.name || "").trim();
  const email = String(body?.email || "").trim().toLowerCase();
  const departmentId = String(body?.departmentId || "");
  const role = assignableRoles.has(body?.role) ? (body.role as Role) : Role.LEADER;
  const position = String(body?.position || "").trim();
  const receivesNotifications = body?.receivesNotifications !== false;

  if (!name || !email) {
    return NextResponse.json({ error: "Заполните имя и email" }, { status: 400 });
  }

  if (role === Role.LEADER && !departmentId) {
    return NextResponse.json(
      { error: "Для руководителя или заместителя нужно указать подразделение" },
      { status: 400 }
    );
  }

  await prisma.user.upsert({
    where: { email },
    update: {
      name,
      role,
      position,
      departmentId: role === Role.LEADER ? departmentId : null,
      receivesNotifications,
      isActive: true
    },
    create: {
      name,
      email,
      role,
      position,
      departmentId: role === Role.LEADER ? departmentId : null,
      passwordHash: null,
      mustChangePassword: true,
      receivesNotifications,
      isActive: true
    }
  });

  return NextResponse.json({ message: "Пользователь сохранен. Пароль будет задан при первом входе." });
}
