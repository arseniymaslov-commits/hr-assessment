import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (user?.role !== Role.ADMIN) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  if (user.id === params.id) {
    return NextResponse.json({ error: "Нельзя отключить текущего пользователя" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: params.id },
    data: { isActive: false }
  });

  return NextResponse.json({ message: "Пользователь отключен" });
}
