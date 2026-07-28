import { PeriodStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const BISHKEK_TIME_ZONE = "Asia/Bishkek";

type PeriodParts = {
  month: number;
  year: number;
  status: PeriodStatus;
};

function bishkekParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BISHKEK_TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric"
  }).formatToParts(date);

  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day")
  };
}

function previousMonth(month: number, year: number) {
  return month === 1 ? { month: 12, year: year - 1 } : { month: month - 1, year };
}

export function getScheduledAssessmentPeriod(date = new Date()): PeriodParts {
  const { day, month, year } = bishkekParts(date);

  if (day >= 20) {
    return { month, year, status: PeriodStatus.OPEN };
  }

  const previous = previousMonth(month, year);
  return {
    ...previous,
    status: PeriodStatus.OPEN
  };
}

export async function ensureScheduledAssessmentPeriod(date = new Date()) {
  const target = getScheduledAssessmentPeriod(date);
  const [targetPeriod, otherOpenPeriod] = await Promise.all([
    prisma.period.findUnique({
      where: { month_year: { month: target.month, year: target.year } }
    }),
    prisma.period.findFirst({
      where: {
        status: PeriodStatus.OPEN,
        NOT: { month: target.month, year: target.year }
      },
      select: { id: true }
    })
  ]);

  if (targetPeriod?.status === target.status && !otherOpenPeriod) {
    return targetPeriod;
  }

  await prisma.period.updateMany({
    where: {
      OR: [
        { status: PeriodStatus.OPEN },
        { month: target.month, year: target.year }
      ],
      NOT: { month: target.month, year: target.year }
    },
    data: { status: PeriodStatus.CLOSED }
  });

  return prisma.period.upsert({
    where: { month_year: { month: target.month, year: target.year } },
    update: { status: target.status },
    create: {
      month: target.month,
      year: target.year,
      status: target.status
    }
  });
}
