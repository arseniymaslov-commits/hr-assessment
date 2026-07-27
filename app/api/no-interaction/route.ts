import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit";
import { departmentOptionLabel } from "@/lib/department-decodings";
import { isEvaluatableDepartment } from "@/lib/evaluation-scope";
import { getOverallCriterion } from "@/lib/evaluation-mail-schedule";
import { readNoInteractionToken } from "@/lib/no-interaction-token";
import { prisma } from "@/lib/prisma";

function htmlPage(title: string, body: string, status = 200) {
  return new NextResponse(
    `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body { margin:0; font-family: Arial, sans-serif; background:#f6f7f9; color:#0f172a; }
      main { max-width:720px; margin:64px auto; background:white; border:1px solid #e2e8f0; border-radius:14px; padding:32px; }
      h1 { margin:0 0 12px; font-size:26px; }
      p { color:#475569; line-height:1.55; }
      a { color:#e30613; font-weight:700; }
    </style>
  </head>
  <body>
    <main>
      <h1>${title}</h1>
      ${body}
      <p><a href="/evaluations">Перейти в систему оценки</a></p>
    </main>
  </body>
</html>`,
    {
      status,
      headers: { "Content-Type": "text/html; charset=utf-8" }
    }
  );
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  const payload = readNoInteractionToken(token);

  if (!payload) {
    return htmlPage(
      "Ссылка недействительна",
      "<p>Ссылка устарела или была повреждена. Пожалуйста, откройте систему оценки обычным способом.</p>",
      400
    );
  }

  const [period, user, evaluatorDepartment, criterion, departments] = await Promise.all([
    prisma.period.findUnique({ where: { id: payload.periodId } }),
    prisma.user.findUnique({ where: { id: payload.userId }, include: { department: true } }),
    prisma.department.findUnique({ where: { id: payload.evaluatorDepartmentId } }),
    getOverallCriterion(),
    prisma.department.findMany({ where: { isActive: true }, orderBy: { name: "asc" } })
  ]);

  if (!period || !user || !evaluatorDepartment || !criterion) {
    return htmlPage(
      "Данные не найдены",
      "<p>Не удалось найти период, пользователя, отдел или критерий оценки. Обратитесь к администратору HR.</p>",
      404
    );
  }

  if (
    !user.isActive ||
    user.role !== Role.LEADER ||
    !user.departmentId ||
    user.departmentId !== payload.evaluatorDepartmentId
  ) {
    return htmlPage(
      "Недостаточно прав",
      "<p>Эта ссылка привязана к другому пользователю или подразделению.</p>",
      403
    );
  }

  const evaluateeDepartments = departments
    .filter(isEvaluatableDepartment)
    .filter((department) => department.id !== payload.evaluatorDepartmentId);

  const existingEvaluations = await prisma.evaluation.findMany({
    where: {
      periodId: payload.periodId,
      criterionId: criterion.id,
      evaluatorDepartmentId: payload.evaluatorDepartmentId,
      evaluateeDepartmentId: { in: evaluateeDepartments.map((department) => department.id) }
    },
    select: {
      id: true,
      evaluateeDepartmentId: true,
      score: true,
      noInteraction: true
    }
  });
  const existingByDepartmentId = new Map(
    existingEvaluations.map((evaluation) => [evaluation.evaluateeDepartmentId, evaluation])
  );

  let marked = 0;
  const skipped = existingEvaluations.filter(
    (evaluation) => evaluation.score != null || evaluation.noInteraction
  ).length;

  for (const department of evaluateeDepartments) {
    const existing = existingByDepartmentId.get(department.id);
    if (existing?.score != null || existing?.noInteraction) continue;

    const data = {
      periodId: payload.periodId,
      evaluatorDepartmentId: payload.evaluatorDepartmentId,
      evaluatorUserId: null,
      evaluateeDepartmentId: department.id,
      criterionId: criterion.id,
      score: null,
      noInteraction: true,
      deviationCategories: [],
      comment: "Не было взаимодействия за период",
      authorId: user.id
    };

    if (existing) {
      await prisma.evaluation.update({ where: { id: existing.id }, data });
    } else {
      await prisma.evaluation.create({ data });
    }
    marked += 1;
  }

  await writeAuditLog({
    action: "evaluation.no_interaction.email",
    summary: "Нет взаимодействия отмечено из письма",
    details: [
      `Кто оценивает: ${departmentOptionLabel(evaluatorDepartment)}.`,
      `Отмечено подразделений: ${marked}.`,
      `Уже было заполнено/отмечено: ${skipped}.`
    ].join(" "),
    user,
    request
  });

  const evaluatorLabel = escapeHtml(departmentOptionLabel(evaluatorDepartment));

  return htmlPage(
    "Отметка сохранена",
    `<p>Для подразделения <b>${evaluatorLabel}</b> отмечено: <b>не было взаимодействия за период</b>.</p>
     <p>Новых отметок: <b>${marked}</b>. Уже заполненных строк не изменяли: <b>${skipped}</b>.</p>`
  );
}
