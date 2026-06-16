import { NextResponse } from "next/server";
import { PeriodStatus, Role } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (user?.role !== Role.ADMIN) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const month = Number(body?.month);
  const year = Number(body?.year);

  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year)) {
    return NextResponse.json({ error: "Укажите корректный месяц и год" }, { status: 400 });
  }

  await prisma.period.updateMany({
    where: { status: PeriodStatus.OPEN },
    data: { status: PeriodStatus.CLOSED }
  });

  await prisma.period.upsert({
    where: { month_year: { month, year } },
    update: { status: PeriodStatus.OPEN },
    create: { month, year, status: PeriodStatus.OPEN }
  });

  return NextResponse.json({ message: "Период открыт" });
}
