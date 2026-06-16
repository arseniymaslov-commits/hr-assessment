import { prisma } from "@/lib/prisma";
import { processEvaluationRequestSchedule } from "@/lib/evaluation-requests";

type RequirementPair = {
  evaluatorDepartmentId: string;
  evaluateeDepartmentId: string;
};

export async function getReferenceData() {
  const [departments, periods, criteria, users, requirements] = await Promise.all([
    prisma.department.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.period.findMany({ orderBy: [{ year: "desc" }, { month: "desc" }] }),
    prisma.criterion.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ orderBy: { name: "asc" }, include: { department: true } }),
    prisma.evaluationRequirement.findMany({
      where: { isActive: true },
      include: { evaluatorDepartment: true, evaluateeDepartment: true },
      orderBy: [{ evaluatorDepartment: { name: "asc" } }, { evaluateeDepartment: { name: "asc" } }]
    })
  ]);

  return { departments, periods, criteria, users, requirements };
}

export async function getPeriodMetrics(periodId?: string) {
  await processEvaluationRequestSchedule();

  const periods = await prisma.period.findMany({
    orderBy: [{ year: "desc" }, { month: "desc" }]
  });
  const selectedPeriod = periodId
    ? periods.find((period) => period.id === periodId) || periods[0]
    : periods[0];

  const departments = await prisma.department.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" }
  });
  const criterion =
    (await prisma.criterion.findFirst({ where: { name: "Общая оценка взаимодействия" } })) ||
    (await prisma.criterion.findFirst({ where: { isActive: true } }));
  const requirements = await getRequiredPairs(departments.map((department) => department.id));

  if (!selectedPeriod || !criterion) {
    return {
      periods,
      selectedPeriod: null,
      departments,
      requirements,
      evaluations: [],
      byEvaluatee: [],
      byEvaluator: [],
      companyAverage: null,
      lowScores: [],
      missingCount: 0,
      expectedCount: 0,
      completion: [],
      dynamics: []
    };
  }

  const activeDepartmentIds = new Set(departments.map((department) => department.id));
  const allEvaluations = await prisma.evaluation.findMany({
    where: { periodId: selectedPeriod.id, criterionId: criterion.id },
    include: {
      evaluatorDepartment: true,
      evaluatorUser: true,
      evaluateeDepartment: true,
      author: true,
      period: true,
      criterion: true
    },
    orderBy: { updatedAt: "desc" }
  });
  const evaluations = allEvaluations.filter(
    (evaluation) =>
      (evaluation.evaluatorDepartmentId == null ||
        activeDepartmentIds.has(evaluation.evaluatorDepartmentId)) &&
      activeDepartmentIds.has(evaluation.evaluateeDepartmentId)
  );
  const scoredEvaluations = evaluations.filter(
    (evaluation) => !evaluation.noInteraction && evaluation.score != null
  );

  const average = (scores: number[]) =>
    scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null;

  const byEvaluatee = departments.map((department) => {
    const relevantEvaluations = scoredEvaluations.filter(
      (evaluation) => evaluation.evaluateeDepartmentId === department.id
    );
    const scores = relevantEvaluations.map((evaluation) => evaluation.score as number);
    const noInteractionCount = evaluations.filter(
      (evaluation) => evaluation.evaluateeDepartmentId === department.id && evaluation.noInteraction
    ).length;

    return {
      department,
      average: average(scores),
      count: scores.length,
      noInteractionCount,
      lowCount: scores.filter((score) => score < 9).length
    };
  });

  const byEvaluator = departments.map((department) => {
    const relevantEvaluations = scoredEvaluations.filter(
      (evaluation) => evaluation.evaluatorDepartmentId === department.id
    );
    const scores = relevantEvaluations.map((evaluation) => evaluation.score as number);
    const noInteractionCount = evaluations.filter(
      (evaluation) => evaluation.evaluatorDepartmentId === department.id && evaluation.noInteraction
    ).length;

    return {
      department,
      average: average(scores),
      count: scores.length,
      noInteractionCount
    };
  });

  const evaluationKeys = new Set(
    evaluations
      .filter((evaluation) => evaluation.evaluatorDepartmentId)
      .map((evaluation) => `${evaluation.evaluatorDepartmentId}:${evaluation.evaluateeDepartmentId}`)
  );
  const completion = departments.map((department) => {
    const requiredPairs = requirements.filter(
      (requirement) => requirement.evaluatorDepartmentId === department.id
    );
    const filled = requiredPairs.filter((requirement) =>
      evaluationKeys.has(`${requirement.evaluatorDepartmentId}:${requirement.evaluateeDepartmentId}`)
    ).length;

    return {
      department,
      filled,
      expected: requiredPairs.length,
      missing: Math.max(0, requiredPairs.length - filled),
      isComplete: filled >= requiredPairs.length
    };
  });

  const expectedCount = requirements.length;
  const filledRequiredCount = requirements.filter((requirement) =>
    evaluationKeys.has(`${requirement.evaluatorDepartmentId}:${requirement.evaluateeDepartmentId}`)
  ).length;
  const missingCount = Math.max(0, expectedCount - filledRequiredCount);

  const dynamics = await Promise.all(
    periods
      .slice()
      .reverse()
      .map(async (period) => {
        const rows = await prisma.evaluation.findMany({
          where: { periodId: period.id, criterionId: criterion.id, noInteraction: false },
          select: { score: true }
        });
        return {
          period,
          average: average(rows.map((row) => row.score).filter((score): score is number => score != null))
        };
      })
  );

  return {
    periods,
    selectedPeriod,
    departments,
    requirements,
    evaluations,
    byEvaluatee,
    byEvaluator,
    companyAverage: average(scoredEvaluations.map((evaluation) => evaluation.score as number)),
    lowScores: scoredEvaluations.filter((evaluation) => (evaluation.score as number) < 9),
    missingCount,
    expectedCount,
    completion,
    dynamics
  };
}

async function getRequiredPairs(activeDepartmentIds: string[]): Promise<RequirementPair[]> {
  const activeSet = new Set(activeDepartmentIds);
  const allRequirements = await prisma.evaluationRequirement.findMany();

  if (allRequirements.length === 0) {
    return activeDepartmentIds.flatMap((evaluatorDepartmentId) =>
      activeDepartmentIds
        .filter((evaluateeDepartmentId) => evaluateeDepartmentId !== evaluatorDepartmentId)
        .map((evaluateeDepartmentId) => ({ evaluatorDepartmentId, evaluateeDepartmentId }))
    );
  }

  return allRequirements
    .filter(
      (requirement) =>
        requirement.isActive &&
        activeSet.has(requirement.evaluatorDepartmentId) &&
        activeSet.has(requirement.evaluateeDepartmentId) &&
        requirement.evaluatorDepartmentId !== requirement.evaluateeDepartmentId
    )
    .map((requirement) => ({
      evaluatorDepartmentId: requirement.evaluatorDepartmentId,
      evaluateeDepartmentId: requirement.evaluateeDepartmentId
    }));
}
