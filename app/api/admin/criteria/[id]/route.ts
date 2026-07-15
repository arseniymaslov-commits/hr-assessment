import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (user?.role !== Role.ADMIN) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const criterion = await prisma.criterion.findUnique({ where: { id: params.id } });
  if (criterion?.name === "Общая оценка взаимодействия") {
    return NextResponse.json(
      { error: "Базовый критерий нужен для расчета дашборда" },
      { status: 400 }
    );
  }

  const updated = await prisma.criterion.update({
    where: { id: params.id },
    data: { isActive: false }
  });

  await writeAuditLog({
    action: "criterion.disable",
    summary: "Критерий отключен",
    details: updated.name,
    user,
    request
  });

  return NextResponse.json({ message: "Критерий удален из активного списка" });
}
