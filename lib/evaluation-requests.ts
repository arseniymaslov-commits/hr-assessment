import { PeriodStatus, Role } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { isEvaluatableDepartment } from "@/lib/evaluation-scope";
import { periodLabel } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { emailActionLink, sendMail } from "@/lib/email";

type LaunchEvaluationInput = {
  periodId: string;
  evaluateeDepartmentId: string;
  initiatedById: string;
  scheduledAt?: Date;
  notifyNow?: boolean;
};

function getAppUrl() {
  const configuredUrl = process.env.APP_URL;
  if (configuredUrl) return configuredUrl.replace(/\/$/, "");

  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercelUrl) return `https://${vercelUrl}`.replace(/\/$/, "");

  return "http://localhost:3000";
}

function greeting(name: string) {
  return `Уважаемый ${name}`;
}

async function activeAdminEmails() {
  const admins = await prisma.user.findMany({
    where: {
      isActive: true,
      receivesNotifications: true,
      role: Role.ADMIN,
      email: { not: "" }
    },
    select: { email: true }
  });
  return admins.map((admin) => admin.email);
}

export async function notifyEvaluationRequests(requestIds: string[]) {
  const requests = await prisma.evaluationRequest.findMany({
    where: {
      id: { in: requestIds },
      notificationSentAt: null
    },
    include: {
      period: true,
      evaluateeDepartment: true,
      initiatedBy: true
    },
    orderBy: { createdAt: "asc" }
  });
  if (!requests.length) {
    return { recipientsCount: 0, requirementsCount: 0, mailSkipped: false };
  }

  const evaluateeDepartmentIds = requests.map((request) => request.evaluateeDepartmentId);
  const requirements = await prisma.evaluationRequirement.findMany({
    where: { evaluateeDepartmentId: { in: evaluateeDepartmentIds }, isActive: true },
    include: { evaluatorDepartment: true, evaluateeDepartment: true }
  });
  const evaluatorDepartmentIds = Array.from(new Set(requirements.map((requirement) => requirement.evaluatorDepartmentId)));
  const recipients = await prisma.user.findMany({
    where: {
      isActive: true,
      receivesNotifications: true,
      role: Role.LEADER,
      departmentId: { in: evaluatorDepartmentIds }
    },
    include: { department: true }
  });

  const appUrl = getAppUrl();
  const evaluationUrl = `${appUrl}/evaluations`;
  const period = requests[0].period;
  const mailResults: Array<{ skipped: boolean; recipientsCount: number }> = [];
  const batchSize = 4;
  for (let index = 0; index < recipients.length; index += batchSize) {
    const batch = recipients.slice(index, index + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (recipient) => {
        const targetDepartments = requirements
          .filter((requirement) => requirement.evaluatorDepartmentId === recipient.departmentId)
          .map((requirement) => requirement.evaluateeDepartment.name);
        const uniqueTargets = Array.from(new Set(targetDepartments)).sort((a, b) => a.localeCompare(b));
        return sendMail({
          to: [recipient.email],
          subject: "Просим оценить взаимодействие с отделами",
          text: [
            `${greeting(recipient.name)}.`,
            "",
            "Просим оценить взаимодействие с отделами.",
            periodLabel(period),
            uniqueTargets.length ? `Доступно для оценки: ${uniqueTargets.join(", ")}.` : "",
            "",
            `Перейдите в форму оценки: ${evaluationUrl}`
          ].filter(Boolean).join("\n"),
          html: [
            `<p>${greeting(recipient.name)}.</p>`,
            "<p>Просим оценить взаимодействие с отделами.</p>",
            "<ul>",
            `<li>${periodLabel(period)}</li>`,
            uniqueTargets.length ? `<li>Доступно для оценки: ${uniqueTargets.join(", ")}</li>` : "",
            "</ul>",
            emailActionLink(evaluationUrl, "Перейти к оценке")
          ].filter(Boolean).join("")
        });
      })
    );
    mailResults.push(...batchResults);
  }

  const skipped = mailResults.some((result) => result.skipped);
  const sent = mailResults.filter((result) => !result.skipped).length;

  if (!skipped) {
    await prisma.evaluationRequest.updateMany({
      where: { id: { in: requests.map((request) => request.id) } },
      data: { notificationSentAt: new Date() }
    });
  }

  return {
    recipientsCount: sent,
    requirementsCount: requirements.length,
    mailSkipped: skipped
  };
}

export async function launchEvaluationRequest({
  periodId,
  evaluateeDepartmentId,
  initiatedById,
  scheduledAt,
  notifyNow = true
}: LaunchEvaluationInput) {
  const normalizedScheduledAt = scheduledAt || new Date();
  const request = await prisma.evaluationRequest.upsert({
    where: {
      periodId_evaluateeDepartmentId: {
        periodId,
        evaluateeDepartmentId
      }
    },
    update: {
      initiatedById,
      scheduledAt: normalizedScheduledAt,
      notificationSentAt: null
    },
    create: {
      periodId,
      evaluateeDepartmentId,
      initiatedById,
      scheduledAt: normalizedScheduledAt
    }
  });

  if (notifyNow && normalizedScheduledAt <= new Date()) {
    const notification = await notifyEvaluationRequests([request.id]);
    return { request, ...notification, scheduled: false };
  }

  const requirementsCount = await prisma.evaluationRequirement.count({
    where: { evaluateeDepartmentId, isActive: true }
  });

  return {
    request,
    recipientsCount: 0,
    requirementsCount,
    mailSkipped: false,
    scheduled: normalizedScheduledAt > new Date()
  };
}

export async function notifyDueEvaluationRequests() {
  const dueRequests = await prisma.evaluationRequest.findMany({
    where: {
      scheduledAt: { lte: new Date() },
      notificationSentAt: null
    },
    select: { id: true, periodId: true }
  });

  let notifiedRequests = 0;
  let recipientsCount = 0;
  let skippedRequests = 0;
  const periodIds = Array.from(new Set(dueRequests.map((request) => request.periodId)));
  for (const periodId of periodIds) {
    const requestIds = dueRequests
      .filter((request) => request.periodId === periodId)
      .map((request) => request.id);
    const result = await notifyEvaluationRequests(requestIds);
    notifiedRequests += requestIds.length;
    recipientsCount += result.recipientsCount;
    if (result.mailSkipped) skippedRequests += requestIds.length;
  }

  return { notifiedRequests, recipientsCount, skippedRequests };
}

export async function sendDeadlineReminders() {
  return { reminderRequests: 0, reminderRecipients: 0 };
}

export async function finalizeExpiredEvaluationRequests() {
  return { autoClosed: 0 };
}

export async function processEvaluationRequestSchedule() {
  const autoLaunch = await autoLaunchCurrentMonthIfNeeded();
  const notified = await notifyDueEvaluationRequests();
  return { ...autoLaunch, ...notified, reminderRequests: 0, reminderRecipients: 0, autoClosed: 0 };
}

function almatyDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Bishkek",
    year: "numeric",
    month: "numeric",
    day: "numeric"
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { day: get("day"), month: get("month"), year: get("year") };
}

async function autoLaunchCurrentMonthIfNeeded() {
  const { day, month, year } = almatyDateParts();
  if (day !== 1) return { autoMonthlyLaunched: false, autoMonthlyRequests: 0 };

  const admin = await prisma.user.findFirst({
    where: { role: Role.ADMIN, isActive: true },
    orderBy: { createdAt: "asc" }
  });
  if (!admin) return { autoMonthlyLaunched: false, autoMonthlyRequests: 0 };

  await prisma.period.updateMany({
    where: { status: PeriodStatus.OPEN },
    data: { status: PeriodStatus.CLOSED }
  });
  const period = await prisma.period.upsert({
    where: { month_year: { month, year } },
    update: { status: PeriodStatus.OPEN },
    create: { month, year, status: PeriodStatus.OPEN }
  });
  const existingRequests = await prisma.evaluationRequest.count({
    where: { periodId: period.id }
  });
  if (existingRequests > 0) return { autoMonthlyLaunched: false, autoMonthlyRequests: existingRequests };

  const departments = (await prisma.department.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" }
  })).filter(isEvaluatableDepartment);
  const requestIds: string[] = [];
  for (const department of departments) {
    const result = await launchEvaluationRequest({
      periodId: period.id,
      evaluateeDepartmentId: department.id,
      initiatedById: admin.id,
      notifyNow: false
    });
    requestIds.push(result.request.id);
  }
  await notifyEvaluationRequests(requestIds);
  await notifyAdminsEvaluationStarted({
    periodId: period.id,
    initiatedById: admin.id,
    summary: `Автоматически запущена ежемесячная оценка для всех СП: ${departments.length}.`
  });

  return { autoMonthlyLaunched: true, autoMonthlyRequests: requestIds.length };
}

export async function notifyAdminsEvaluationStarted({
  periodId,
  initiatedById,
  summary
}: {
  periodId: string;
  initiatedById: string;
  summary: string;
}) {
  const [period, initiatedBy, admins] = await Promise.all([
    prisma.period.findUnique({ where: { id: periodId } }),
    prisma.user.findUnique({ where: { id: initiatedById } }),
    activeAdminEmails()
  ]);
  if (!period || !admins.length) return { adminRecipients: 0 };
  const dashboardUrl = `${getAppUrl()}/dashboard`;

  const result = await sendMail({
    to: admins,
    subject: "Оценка взаимодействия запущена",
    text: [
      "Оценка взаимодействия запущена.",
      periodLabel(period),
      initiatedBy ? `Запустил: ${initiatedBy.name}.` : "",
      summary,
      `Открыть приложение: ${dashboardUrl}`
    ].filter(Boolean).join("\n"),
    html: [
      "<p>Оценка взаимодействия запущена.</p>",
      "<ul>",
      `<li>${periodLabel(period)}</li>`,
      initiatedBy ? `<li>Запустил: ${initiatedBy.name}</li>` : "",
      `<li>${summary}</li>`,
      "</ul>",
      emailActionLink(dashboardUrl, "Открыть дашборд")
    ].filter(Boolean).join("")
  });

  await writeAuditLog({
    action: "evaluation.launch",
    summary: "Запущена оценка взаимодействия",
    details: summary,
    user: initiatedBy
  });

  return { adminRecipients: result.skipped ? 0 : admins.length };
}
