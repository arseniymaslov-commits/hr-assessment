import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  const directorEvaluations = await prisma.evaluation.findMany({
    where: {
      evaluatorUserId: { not: null }
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      periodId: true,
      evaluatorUserId: true,
      evaluateeDepartmentId: true,
      criterionId: true
    }
  });

  const groups = new Map();

  for (const row of directorEvaluations) {
    const key = [
      row.periodId,
      row.evaluatorUserId,
      row.evaluateeDepartmentId,
      row.criterionId
    ].join(":");
    const rows = groups.get(key) || [];
    rows.push(row);
    groups.set(key, rows);
  }

  let removed = 0;

  for (const rows of groups.values()) {
    const [, ...olderRows] = rows;
    if (!olderRows.length) continue;

    const result = await prisma.evaluation.deleteMany({
      where: { id: { in: olderRows.map((row) => row.id) } }
    });
    removed += result.count;
  }

  if (removed > 0) {
    console.log(`Removed duplicate director evaluations: ${removed}`);
  }
} finally {
  await prisma.$disconnect();
}
