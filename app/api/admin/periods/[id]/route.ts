import { NextResponse } from "next/server";
import { PeriodStatus, Role } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (user?.role !== Role.ADMIN) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const status = body?.status === "OPEN" ? PeriodStatus.OPEN : PeriodStatus.CLOSED;

  if (status === PeriodStatus.OPEN) {
    await prisma.period.updateMany({
      where: { status: PeriodStatus.OPEN, id: { not: params.id } },
      data: { status: PeriodStatus.CLOSED }
    });
  }

  const period = await prisma.period.update({
    where: { id: params.id },
    data: { status }
  });

  await writeAuditLog({
    action: status === PeriodStatus.OPEN ? "period.reopen" : "period.close",
    summary: status === PeriodStatus.OPEN ? "Период открыт повторно" : "Период закрыт и оценки заморожены",
    details: `${String(period.month).padStart(2, "0")}.${period.year}`,
    user
  });

  return NextResponse.json({ message: "Статус периода обновлен" });
}
