import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (user?.role !== Role.ADMIN) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const name = String(body?.name || "").trim();
  const description = String(body?.description || "").trim();

  if (!name) {
    return NextResponse.json({ error: "Укажите название критерия" }, { status: 400 });
  }

  await prisma.criterion.upsert({
    where: { name },
    update: { description: description || null, isActive: true },
    create: { name, description: description || null, isActive: true }
  });

  return NextResponse.json({ message: "Критерий сохранен" });
}
