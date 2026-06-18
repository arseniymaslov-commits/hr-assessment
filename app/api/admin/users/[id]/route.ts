import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (user?.role !== Role.ADMIN) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const data: { receivesNotifications?: boolean; isActive?: boolean } = {};
  if (typeof body?.receivesNotifications === "boolean") {
    data.receivesNotifications = body.receivesNotifications;
  }
  if (typeof body?.isActive === "boolean") {
    data.isActive = body.isActive;
  }

  if (!Object.keys(data).length) {
    return NextResponse.json({ error: "Нет изменений" }, { status: 400 });
  }

  if (user.id === params.id && data.isActive === false) {
    return NextResponse.json({ error: "Нельзя отключить текущего пользователя" }, { status: 400 });
  }

  const targetUser = await prisma.user.update({
    where: { id: params.id },
    data
  });

  await writeAuditLog({
    action: "user.update",
    summary: "Пользователь обновлен",
    details: `${targetUser.name} (${targetUser.email})`,
    user
  });

  return NextResponse.json({ message: "Пользователь обновлен" });
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (user?.role !== Role.ADMIN) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  if (user.id === params.id) {
    return NextResponse.json({ error: "Нельзя отключить текущего пользователя" }, { status: 400 });
  }

  const targetUser = await prisma.user.update({
    where: { id: params.id },
    data: { isActive: false }
  });

  await writeAuditLog({
    action: "user.disable",
    summary: "Пользователь отключен",
    details: `${targetUser.name} (${targetUser.email})`,
    user
  });

  return NextResponse.json({ message: "Пользователь отключен" });
}
