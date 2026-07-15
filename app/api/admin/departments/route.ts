import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (user?.role !== Role.ADMIN) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const name = String(body?.name || "").trim();
  const shortName = String(body?.shortName || "").trim();

  if (!name || !shortName) {
    return NextResponse.json({ error: "Укажите название и краткое имя" }, { status: 400 });
  }

  await prisma.department.upsert({
    where: { name },
    update: { shortName, isActive: true },
    create: { name, shortName, isActive: true }
  });

  await writeAuditLog({
    action: "department.save",
    summary: "Подразделение сохранено",
    details: `${name} — ${shortName}`,
    user,
    request
  });

  return NextResponse.json({ message: "Подразделение сохранено" });
}
