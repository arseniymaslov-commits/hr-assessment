import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (user?.role !== Role.ADMIN) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  await prisma.user.update({
    where: { id: params.id },
    data: {
      passwordHash: null,
      mustChangePassword: true
    }
  });

  return NextResponse.json({ message: "Пароль сброшен. Пользователь задаст новый пароль при входе." });
}
