import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { finalizeExpiredEvaluationRequests } from "@/lib/evaluation-requests";

async function canRun(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const bearer = request.headers.get("authorization");
    return request.headers.get("x-cron-secret") === secret || bearer === `Bearer ${secret}`;
  }

  const user = await getCurrentUser();
  return user?.role === Role.ADMIN;
}

async function handler(request: Request) {
  if (!(await canRun(request))) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const result = await finalizeExpiredEvaluationRequests();
  return NextResponse.json({
    message: `Просроченные оценки обработаны. Автоматически отмечено: ${result.autoClosed}.`,
    ...result
  });
}

export const GET = handler;
export const POST = handler;
