import { EmailDeliveryStatus } from "@prisma/client";
import { sendMail } from "@/lib/email";
import { prisma } from "@/lib/prisma";

type QueueMailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  context?: string;
  periodId?: string;
};

export async function sendTrackedMail(input: QueueMailInput) {
  const delivery = await prisma.emailDelivery.create({
    data: {
      to: input.to,
      subject: input.subject,
      context: input.context,
      periodId: input.periodId,
      status: EmailDeliveryStatus.PENDING
    }
  });

  const result = await sendMail({
    to: [input.to],
    subject: input.subject,
    text: input.text,
    html: input.html
  });

  const status = result.skipped ? EmailDeliveryStatus.FAILED : EmailDeliveryStatus.SENT;
  await prisma.emailDelivery.update({
    where: { id: delivery.id },
    data: {
      status,
      attempts: { increment: 1 },
      lastError: result.skipped ? result.error || "Email was not delivered" : null,
      sentAt: result.skipped ? null : new Date()
    }
  });

  return { ...result, deliveryId: delivery.id };
}
