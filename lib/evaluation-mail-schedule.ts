import { EmailDeliveryStatus, Role } from "@prisma/client";
import { departmentOptionLabel } from "@/lib/department-decodings";
import { emailActionLink } from "@/lib/email";
import { sendTrackedMail } from "@/lib/email-delivery";
import { isEvaluatableDepartment } from "@/lib/evaluation-scope";
import { periodLabel } from "@/lib/format";
import { createNoInteractionToken } from "@/lib/no-interaction-token";
import { ensureScheduledAssessmentPeriod } from "@/lib/period-automation";
import { prisma } from "@/lib/prisma";

const TIME_ZONE = "Asia/Bishkek";
export const OVERALL_CRITERION_NAME = "Общая оценка взаимодействия";

type DateParts = {
  day: number;
  month: number;
  year: number;
  dateKey: string;
};

function getAppUrl() {
  const configuredUrl = process.env.APP_URL;
  if (configuredUrl) return configuredUrl.replace(/\/$/, "");

  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercelUrl) return `https://${vercelUrl}`.replace(/\/$/, "");

  return "http://localhost:3000";
}

function dateParts(date = new Date()): DateParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return {
    day: Number(get("day")),
    month: Number(get("month")),
    year: Number(get("year")),
    dateKey: `${get("year")}-${get("month")}-${get("day")}`
  };
}

function deadlineLabel({ month, year }: DateParts) {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: TIME_ZONE,
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(new Date(Date.UTC(year, month - 1, 5, 12, 0, 0)));
}

function noInteractionExpiresAt({ month, year }: DateParts) {
  return new Date(Date.UTC(year, month - 1, 19, 17, 59, 59));
}

export async function getOverallCriterion() {
  return (
    (await prisma.criterion.findFirst({ where: { name: OVERALL_CRITERION_NAME } })) ||
    (await prisma.criterion.findFirst({ where: { isActive: true } }))
  );
}

function assessmentPeriodName(period: { month: number; year: number }) {
  return periodLabel(period).replace("Оценка взаимодействия СП за ", "");
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

async function getRecipientsAndTargets(periodId: string) {
  const [departments, leaders, criterion] = await Promise.all([
    prisma.department.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({
      where: {
        isActive: true,
        receivesNotifications: true,
        role: Role.LEADER,
        email: { not: "" },
        departmentId: { not: null }
      },
      include: { department: true },
      orderBy: { name: "asc" }
    }),
    getOverallCriterion()
  ]);

  if (!criterion) return [];

  const evaluateeDepartments = departments.filter(isEvaluatableDepartment);
  const evaluations = await prisma.evaluation.findMany({
    where: {
      periodId,
      criterionId: criterion.id,
      evaluatorDepartmentId: { in: leaders.map((leader) => leader.departmentId).filter(Boolean) as string[] }
    },
    select: {
      evaluatorDepartmentId: true,
      evaluateeDepartmentId: true,
      score: true,
      noInteraction: true
    }
  });
  const filledKeys = new Set(
    evaluations
      .filter((evaluation) => evaluation.evaluatorDepartmentId && (evaluation.noInteraction || evaluation.score != null))
      .map((evaluation) => `${evaluation.evaluatorDepartmentId}:${evaluation.evaluateeDepartmentId}`)
  );

  return leaders
    .filter((leader) => leader.departmentId && leader.department)
    .map((leader) => {
      const targets = evaluateeDepartments.filter((department) => department.id !== leader.departmentId);
      const missingTargets = targets.filter(
        (department) => !filledKeys.has(`${leader.departmentId}:${department.id}`)
      );
      return { leader, targets, missingTargets, criterion };
    });
}

async function alreadyQueued(context: string, periodId: string, to: string) {
  const count = await prisma.emailDelivery.count({
    where: {
      context,
      periodId,
      to,
      status: { in: [EmailDeliveryStatus.PENDING, EmailDeliveryStatus.SENT, EmailDeliveryStatus.FAILED] }
    }
  });
  return count > 0;
}

function noInteractionUrl(periodId: string, evaluatorDepartmentId: string, userId: string, expiresAt: Date) {
  const token = createNoInteractionToken({ periodId, evaluatorDepartmentId, userId }, expiresAt);
  return `${getAppUrl()}/api/no-interaction?token=${encodeURIComponent(token)}`;
}

function secondaryActionLink(url: string, label: string) {
  return [
    '<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:12px 0">',
    "<tr>",
    '<td style="border-radius:6px;border:1px solid #cbd5e1;background:#ffffff">',
    `<a href="${url}" style="display:inline-block;padding:11px 18px;color:#334155;text-decoration:none;font-family:Arial,sans-serif;font-size:14px;font-weight:700">${label}</a>`,
    "</td>",
    "</tr>",
    "</table>"
  ].join("");
}

export async function sendMonthlyEvaluationStart(date = new Date()) {
  const parts = dateParts(date);
  if (parts.day !== 1) return { monthlyStartRecipients: 0 };

  const period = await ensureScheduledAssessmentPeriod(date);
  if (period.status !== "OPEN") return { monthlyStartRecipients: 0 };

  const context = `monthly_start:${parts.dateKey}`;
  const recipients = await getRecipientsAndTargets(period.id);
  const deadline = deadlineLabel(parts);
  const evaluationUrl = `${getAppUrl()}/evaluations`;
  const expiresAt = noInteractionExpiresAt(parts);
  let sent = 0;
  let adminNotices = 0;

  for (const { leader, targets } of recipients) {
    if (!leader.departmentId || !targets.length || (await alreadyQueued(context, period.id, leader.email))) continue;
    const noInteractionLink = noInteractionUrl(period.id, leader.departmentId, leader.id, expiresAt);
    const targetsText = targets.map((department) => departmentOptionLabel(department)).join(", ");
    const subject = `Оценка взаимодействия за ${assessmentPeriodName(period)}`;
    const text = [
      "Уважаемые руководители,",
      `просим оценить ваше взаимодействие с отделами за ${assessmentPeriodName(period)}.`,
      `Дедлайн - ${deadline}. После 5 числа оценка считается просроченной, но доступ остается открытым до 19 числа.`,
      "",
      `Доступные отделы: ${targetsText}.`,
      "",
      `Оценить: ${evaluationUrl}`,
      `Если взаимодействия за период не было: ${noInteractionLink}`
    ].join("\n");
    const html = [
      "<p>Уважаемые руководители,</p>",
      `<p>Просим оценить ваше взаимодействие с отделами за <b>${assessmentPeriodName(period)}</b>.</p>`,
      `<p>Дедлайн - <b>${deadline}</b>. После 5 числа оценка считается просроченной, но доступ остается открытым до 19 числа.</p>`,
      `<p style="color:#475569">Доступные отделы: ${targetsText}</p>`,
      emailActionLink(evaluationUrl, "Оценить"),
      secondaryActionLink(noInteractionLink, "Не было взаимодействия за период")
    ].join("");

    const result = await sendTrackedMail({
      to: leader.email,
      subject,
      text,
      html,
      context,
      periodId: period.id
    });
    if (!result.skipped) sent += 1;
  }

  const adminEmails = await activeAdminEmails();
  for (const email of adminEmails) {
    if (await alreadyQueued(`${context}:admin`, period.id, email)) continue;
    const result = await sendTrackedMail({
      to: email,
      subject: `Оценка взаимодействия запущена за ${assessmentPeriodName(period)}`,
      text: [
        `Оценка взаимодействия за ${assessmentPeriodName(period)} запущена автоматически.`,
        `Руководителям отправлено уведомлений: ${sent}.`,
        `Дедлайн - ${deadline}.`,
        `Дашборд: ${getAppUrl()}/dashboard`
      ].join("\n"),
      html: [
        `<p>Оценка взаимодействия за <b>${assessmentPeriodName(period)}</b> запущена автоматически.</p>`,
        `<p>Руководителям отправлено уведомлений: <b>${sent}</b>. Дедлайн - <b>${deadline}</b>.</p>`,
        emailActionLink(`${getAppUrl()}/dashboard`, "Открыть дашборд")
      ].join(""),
      context: `${context}:admin`,
      periodId: period.id
    });
    if (!result.skipped) adminNotices += 1;
  }

  return { monthlyStartRecipients: sent, adminNoticeRecipients: adminNotices };
}

export async function sendMissingEvaluationReminders(date = new Date()) {
  const parts = dateParts(date);
  const isReminderDay = parts.day >= 6 && parts.day < 20 && (parts.day - 6) % 7 === 0;
  if (!isReminderDay) return { reminderRecipients: 0, reminderDepartments: 0 };

  const period = await ensureScheduledAssessmentPeriod(date);
  const context = `missing_reminder:${parts.dateKey}`;
  const recipients = await getRecipientsAndTargets(period.id);
  const evaluationUrl = `${getAppUrl()}/evaluations`;
  const expiresAt = noInteractionExpiresAt(parts);
  let sent = 0;
  let missingDepartments = 0;

  for (const { leader, missingTargets } of recipients) {
    if (!leader.departmentId || !missingTargets.length || (await alreadyQueued(context, period.id, leader.email))) continue;
    const noInteractionLink = noInteractionUrl(period.id, leader.departmentId, leader.id, expiresAt);
    const missingText = missingTargets.map((department) => departmentOptionLabel(department)).join(", ");
    missingDepartments += missingTargets.length;

    const subject = `Просрочено: остались неоцененные отделы за ${assessmentPeriodName(period)}`;
    const text = [
      `Уважаемый(ая) ${leader.name},`,
      "срок оценки до 5 числа уже прошел, но доступ для внесения оценки остается открытым до 19 числа.",
      `по периоду ${periodLabel(period)} остались неоцененные отделы:`,
      missingText,
      "",
      `Перейти к оценке: ${evaluationUrl}`,
      `Если взаимодействия за период не было: ${noInteractionLink}`
    ].join("\n");
    const html = [
      `<p>Уважаемый(ая) ${leader.name},</p>`,
      "<p><b>Срок оценки до 5 числа уже прошел.</b> Доступ для внесения оценки остается открытым до 19 числа.</p>",
      `<p>По периоду <b>${periodLabel(period)}</b> остались неоцененные отделы:</p>`,
      `<p style="color:#475569">${missingText}</p>`,
      emailActionLink(evaluationUrl, "Оценить"),
      secondaryActionLink(noInteractionLink, "Не было взаимодействия за период")
    ].join("");

    const result = await sendTrackedMail({
      to: leader.email,
      subject,
      text,
      html,
      context,
      periodId: period.id
    });
    if (!result.skipped) sent += 1;
  }

  return { reminderRecipients: sent, reminderDepartments: missingDepartments };
}

export async function processAutomaticEvaluationMail(date = new Date()) {
  const period = await ensureScheduledAssessmentPeriod(date);
  const monthlyStart = await sendMonthlyEvaluationStart(date);
  const reminders = await sendMissingEvaluationReminders(date);

  return {
    activePeriodId: period.id,
    activePeriodStatus: period.status,
    ...monthlyStart,
    ...reminders
  };
}
