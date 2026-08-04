import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

function uniqueStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(String).map((item) => item.trim()).filter(Boolean)));
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (user?.role !== Role.ADMIN) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const name = String(body?.name || "").trim();
  const shortName = String(body?.shortName || "").trim();
  const responsibleName = String(body?.responsibleName || "").trim();
  const responsibleEmail = String(body?.responsibleEmail || "").trim();
  const leaderUserId = String(body?.leaderUserId || "").trim();
  const deputyUserId = String(body?.deputyUserId || "").trim();
  const directorUserIds = uniqueStringArray(body?.directorUserIds);

  if (!name || !shortName) {
    return NextResponse.json({ error: "Укажите название и краткое имя" }, { status: 400 });
  }

  if (responsibleEmail && !responsibleEmail.includes("@")) {
    return NextResponse.json({ error: "Укажите корректный email ответственного" }, { status: 400 });
  }

  const userIds = [leaderUserId, deputyUserId, ...directorUserIds].filter(Boolean);
  if (userIds.length) {
    const existingUsers = await prisma.user.findMany({
      where: { id: { in: userIds }, isActive: true },
      select: { id: true }
    });
    const existingUserIds = new Set(existingUsers.map((item) => item.id));
    const missingUserId = userIds.find((id) => !existingUserIds.has(id));
    if (missingUserId) {
      return NextResponse.json({ error: "Один из выбранных пользователей не найден или отключен" }, { status: 400 });
    }
  }

  const department = await prisma.$transaction(async (tx) => {
    const updated = await tx.department.update({
      where: { id: params.id },
      data: {
        name,
        shortName,
        responsibleName: responsibleName || null,
        responsibleEmail: responsibleEmail || null,
        leaderUserId: leaderUserId || null,
        deputyUserId: deputyUserId || null
      }
    });

    await tx.departmentDirector.deleteMany({ where: { departmentId: params.id } });
    if (directorUserIds.length) {
      await tx.departmentDirector.createMany({
        data: directorUserIds.map((directorUserId) => ({
          departmentId: params.id,
          userId: directorUserId
        })),
        skipDuplicates: true
      });
    }

    const managerUserIds = uniqueStringArray([leaderUserId, deputyUserId]);
    if (managerUserIds.length) {
      await tx.user.updateMany({
        where: { id: { in: managerUserIds }, role: { not: Role.ADMIN } },
        data: { role: Role.LEADER, departmentId: params.id }
      });
    }

    if (directorUserIds.length) {
      await tx.user.updateMany({
        where: { id: { in: directorUserIds }, role: { not: Role.ADMIN } },
        data: { role: Role.DIRECTOR }
      });
    }

    return updated;
  });

  await writeAuditLog({
    action: "department.update",
    summary: "Подразделение отредактировано",
    details: `${department.name} — ${department.shortName}. Директоров: ${directorUserIds.length}.`,
    user,
    request
  });

  return NextResponse.json({ message: "Подразделение обновлено" });
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (user?.role !== Role.ADMIN) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const department = await prisma.department.update({
    where: { id: params.id },
    data: { isActive: false }
  });

  await writeAuditLog({
    action: "department.disable",
    summary: "Подразделение отключено",
    details: `${department.name} — ${department.shortName}`,
    user,
    request
  });

  return NextResponse.json({ message: "Подразделение удалено из активного списка" });
}
