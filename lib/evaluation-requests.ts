import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/email";

const MS_IN_DAY = 1000 * 60 * 60 * 24;

type LaunchEvaluationInput = {
  periodId: string;
  evaluateeDepartmentId: string;
  initiatedById: string;
  scheduledAt?: Date;
  deadlineAt?: Date;
};

function defaultDeadline() {
  return new Date(Date.now() + 3 * MS_IN_DAY);
}

function getAppUrl() {
  const configuredUrl = process.env.APP_URL;
  if (configuredUrl) return configuredUrl.replace(/\/$/, "");

  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercelUrl) return `https://${vercelUrl}`.replace(/\/$/, "");

  return "http://localhost:3000";
}

function formatPeriod(month: number, year: number) {
  return `${String(month).padStart(2, "0")}.${year}`;
}

async function notifyEvaluationRequest(requestId: string) {
  const request = await prisma.evaluationRequest.findUnique({
    where: { id: requestId },
    include: {
      period: true,
      evaluateeDepartment: true,
      initiatedBy: true
    }
  });
  if (!request || request.notificationSentAt) {
    return { recipientsCount: 0, requirementsCount: 0, mailSkipped: false };
  }

  const requirements = await prisma.evaluationRequirement.findMany({
    where: { evaluateeDepartmentId: request.evaluateeDepartmentId, isActive: true },
    include: { evaluatorDepartment: true }
  });
  const evaluatorDepartmentIds = requirements.map((requirement) => requirement.evaluatorDepartmentId);
  const recipients = await prisma.user.findMany({
    where: {
      isActive: true,
      receivesNotifications: true,
      role: { in: [Role.LEADER, Role.ADMIN] },
      departmentId: { in: evaluatorDepartmentIds }
    },
    include: { department: true }
  });

  const appUrl = getAppUrl();
  const evaluationUrl = `${appUrl}/evaluations`;
  const deadline = request.deadlineAt.toLocaleString("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short"
  });
  const recipientDepartments = Array.from(
    new Set(recipients.map((user) => user.department?.name).filter(Boolean))
  ).join(", ");
  const mailResult = await sendMail({
    to: recipients.map((user) => user.email),
    subject: `Нужно оценить взаимодействие с ${request.evaluateeDepartment.name}`,
    text: [
      "Здравствуйте.",
      "",
      `Запущена оценка взаимодействия с подразделением: ${request.evaluateeDepartment.name}.`,
      `Период: ${formatPeriod(request.period.month, request.period.year)}.`,
      `Срок заполнения: ${deadline}.`,
      recipientDepartments ? `Оценку должны заполнить подразделения: ${recipientDepartments}.` : "",
      "",
      `Перейдите в форму оценки: ${evaluationUrl}`,
      "",
      "Если оценка не будет поставлена до срока, система автоматически отметит \"Нет взаимодействия\"."
    ].filter(Boolean).join("\n"),
    html: [
      "<p>Здравствуйте.</p>",
      `<p>Запущена оценка взаимодействия с подразделением: <strong>${request.evaluateeDepartment.name}</strong>.</p>`,
      "<ul>",
      `<li>Период: ${formatPeriod(request.period.month, request.period.year)}</li>`,
      `<li>Срок заполнения: ${deadline}</li>`,
      recipientDepartments ? `<li>Оценку должны заполнить: ${recipientDepartments}</li>` : "",
      "</ul>",
      `<p><a href="${evaluationUrl}">Перейти в форму оценки</a></p>`,
      "<p>Если оценка не будет поставлена до срока, система автоматически отметит «Нет взаимодействия».</p>"
    ].filter(Boolean).join("")
  });

  if (!mailResult.skipped) {
    await prisma.evaluationRequest.update({
      where: { id: request.id },
      data: { notificationSentAt: new Date() }
    });
  }

  return {
    recipientsCount: recipients.length,
    requirementsCount: requirements.length,
    mailSkipped: mailResult.skipped
  };
}

export async function launchEvaluationRequest({
  periodId,
  evaluateeDepartmentId,
  initiatedById,
  scheduledAt,
  deadlineAt
}: LaunchEvaluationInput) {
  const normalizedScheduledAt = scheduledAt || new Date();
  const normalizedDeadlineAt = deadlineAt || defaultDeadline();
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
      deadlineAt: normalizedDeadlineAt,
      notificationSentAt: null,
      autoClosedAt: null
    },
    create: {
      periodId,
      evaluateeDepartmentId,
      initiatedById,
      scheduledAt: normalizedScheduledAt,
      deadlineAt: normalizedDeadlineAt
    }
  });

  if (normalizedScheduledAt <= new Date()) {
    const notification = await notifyEvaluationRequest(request.id);
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
    scheduled: true
  };
}

export async function notifyDueEvaluationRequests() {
  const dueRequests = await prisma.evaluationRequest.findMany({
    where: {
      scheduledAt: { lte: new Date() },
      notificationSentAt: null,
      autoClosedAt: null
    },
    select: { id: true }
  });

  let notifiedRequests = 0;
  let recipientsCount = 0;
  let skippedRequests = 0;
  for (const request of dueRequests) {
    const result = await notifyEvaluationRequest(request.id);
    notifiedRequests += 1;
    recipientsCount += result.recipientsCount;
    if (result.mailSkipped) skippedRequests += 1;
  }

  return { notifiedRequests, recipientsCount, skippedRequests };
}

export async function finalizeExpiredEvaluationRequests() {
  const criterion =
    (await prisma.criterion.findFirst({
      where: { name: "Общая оценка взаимодействия" }
    })) || (await prisma.criterion.findFirst({ where: { isActive: true } }));
  if (!criterion) return { autoClosed: 0 };

  const expiredRequests = await prisma.evaluationRequest.findMany({
    where: {
      deadlineAt: { lt: new Date() },
      scheduledAt: { lte: new Date() },
      autoClosedAt: null
    }
  });

  let autoClosed = 0;
  for (const request of expiredRequests) {
    const requirements = await prisma.evaluationRequirement.findMany({
      where: {
        evaluateeDepartmentId: request.evaluateeDepartmentId,
        isActive: true
      }
    });

    for (const requirement of requirements) {
      const existing = await prisma.evaluation.findFirst({
        where: {
          periodId: request.periodId,
          evaluatorDepartmentId: requirement.evaluatorDepartmentId,
          evaluateeDepartmentId: request.evaluateeDepartmentId,
          criterionId: criterion.id
        }
      });
      if (existing) continue;

      await prisma.evaluation.create({
        data: {
          periodId: request.periodId,
          evaluatorDepartmentId: requirement.evaluatorDepartmentId,
          evaluateeDepartmentId: request.evaluateeDepartmentId,
          criterionId: criterion.id,
          noInteraction: true,
          score: null,
          comment: "Автоматически отмечено: оценка не заполнена до установленного срока",
          authorId: request.initiatedById
        }
      });
      autoClosed += 1;
    }

    await prisma.evaluationRequest.update({
      where: { id: request.id },
      data: { autoClosedAt: new Date() }
    });
  }

  return { autoClosed };
}

export async function processEvaluationRequestSchedule() {
  const notified = await notifyDueEvaluationRequests();
  const finalized = await finalizeExpiredEvaluationRequests();
  return { ...notified, ...finalized };
}
