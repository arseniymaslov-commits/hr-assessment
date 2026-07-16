import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { emailActionLink, sendMail } from "@/lib/email";
import { periodLabel } from "@/lib/format";
import { prisma } from "@/lib/prisma";

function getAppUrl() {
  const configuredUrl = process.env.APP_URL;
  if (configuredUrl) return configuredUrl.replace(/\/$/, "");

  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercelUrl) return `https://${vercelUrl}`.replace(/\/$/, "");

  return "http://localhost:3000";
}


export async function POST(request: Request) {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== Role.ADMIN) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const periodId = String(body?.periodId || "");
  const period = periodId
    ? await prisma.period.findUnique({ where: { id: periodId } })
    : await prisma.period.findFirst({
        where: { status: "OPEN" },
        orderBy: [{ year: "desc" }, { month: "desc" }]
      });

  if (!period) {
    return NextResponse.json({ error: "Период оценки не найден" }, { status: 400 });
  }

  const recipients = await prisma.user.findMany({
    where: {
      isActive: true,
      receivesNotifications: true,
      role: Role.LEADER,
      email: { not: "" }
    },
    include: { department: true },
    orderBy: { name: "asc" }
  });

  if (!recipients.length) {
    return NextResponse.json({ error: "Нет активных руководителей с включенной рассылкой" }, { status: 400 });
  }

  const evaluationUrl = `${getAppUrl()}/evaluations`;
  let sent = 0;
  const failed: string[] = [];

  for (const recipient of recipients) {
    try {
      await sendMail({
        to: [recipient.email],
        subject: "Эскалация: необходимо оценить взаимодействие всех подразделений",
        text: [
          `Здравствуйте, ${recipient.name}.`,
          "",
          "Просим в приоритетном порядке пройти оценку взаимодействия подразделений.",
          periodLabel(period),
          recipient.department?.name ? `Ваше подразделение: ${recipient.department.name}.` : "",
          "",
          `Форма оценки: ${evaluationUrl}`
        ].filter(Boolean).join("\n"),
        html: [
          `<p>Здравствуйте, ${recipient.name}.</p>`,
          "<p>Просим в приоритетном порядке пройти оценку взаимодействия подразделений.</p>",
          "<ul>",
          `<li>${periodLabel(period)}</li>`,
          recipient.department?.name ? `<li>Ваше подразделение: ${recipient.department.name}</li>` : "",
          "</ul>",
          emailActionLink(evaluationUrl, "Перейти к оценке")
        ].filter(Boolean).join("")
      });
      sent += 1;
    } catch {
      failed.push(recipient.email);
    }
  }

  return NextResponse.json({
    message: failed.length
      ? `Эскалация отправлена: ${sent}. Не удалось отправить: ${failed.length}.`
      : `Эскалация отправлена руководителям: ${sent}.`
  });
}
