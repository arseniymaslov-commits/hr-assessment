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
  const responsibleName = String(body?.responsibleName || "").trim();
  const responsibleEmail = String(body?.responsibleEmail || "").trim();

  if (!name || !shortName) {
    return NextResponse.json({ error: "Укажите название и краткое имя" }, { status: 400 });
  }

  if (responsibleEmail && !responsibleEmail.includes("@")) {
    return NextResponse.json({ error: "Укажите корректный email ответственного" }, { status: 400 });
  }

  await prisma.department.upsert({
    where: { name },
    update: {
      shortName,
      responsibleName: responsibleName || null,
      responsibleEmail: responsibleEmail || null,
      isActive: true
    },
    create: {
      name,
      shortName,
      responsibleName: responsibleName || null,
      responsibleEmail: responsibleEmail || null,
      isActive: true
    }
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
