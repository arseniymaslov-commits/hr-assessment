import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/email";

const MS_IN_DAY = 1000 * 60 * 60 * 24;

export async function launchEvaluationRequest({
  periodId,
  evaluateeDepartmentId,
  initiatedById
}: {
  periodId: string;
  evaluateeDepartmentId: string;
  initiatedById: string;
}) {
  const deadlineAt = new Date(Date.now() + 3 * MS_IN_DAY);
  const request = await prisma.evaluationRequest.upsert({
    where: {
      periodId_evaluateeDepartmentId: {
        periodId,
        evaluateeDepartmentId
      }
    },
    update: {
      initiatedById,
      deadlineAt,
      autoClosedAt: null
    },
    create: {
      periodId,
      evaluateeDepartmentId,
      initiatedById,
      deadlineAt
    },
    include: {
      period: true,
      evaluateeDepartment: true,
      initiatedBy: true
    }
  });

  const requirements = await prisma.evaluationRequirement.findMany({
    where: { evaluateeDepartmentId, isActive: true },
    include: { evaluatorDepartment: true }
  });
  const evaluatorDepartmentIds = requirements.map((requirement) => requirement.evaluatorDepartmentId);
  const recipients = await prisma.user.findMany({
    where: {
      isActive: true,
      role: Role.LEADER,
      departmentId: { in: evaluatorDepartmentIds }
    },
    include: { department: true }
  });

  const appUrl = process.env.APP_URL || "http://localhost:3000";
  await sendMail({
    to: recipients.map((user) => user.email),
    subject: `Необходимо оценить взаимодействие с ${request.evaluateeDepartment.name}`,
    text: [
      `Здравствуйте.`,
      ``,
      `Запущена оценка взаимодействия с подразделением: ${request.evaluateeDepartment.name}.`,
      `Период: ${request.period.month}.${request.period.year}.`,
      `Дедлайн: ${request.deadlineAt.toLocaleString("ru-RU")}.`,
      ``,
      `Перейдите в форму оценки: ${appUrl}/evaluations`,
      ``,
      `Если оценка не будет поставлена в течение 3 дней, система автоматически отметит "Нет взаимодействия".`
    ].join("\n")
  });

  await prisma.evaluationRequest.update({
    where: { id: request.id },
    data: { notificationSentAt: new Date() }
  });

  return {
    request,
    recipientsCount: recipients.length,
    requirementsCount: requirements.length
  };
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
          comment: "Автоматически отмечено: нет оценки в течение 3 дней",
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
