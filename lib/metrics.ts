import { prisma } from "@/lib/prisma";
import { departmentOptionLabel } from "@/lib/department-decodings";
import { processEvaluationRequestSchedule } from "@/lib/evaluation-requests";
import {
  DEFAULT_FULL_COVERAGE_EVALUATEE_NAMES,
  isEvaluatableDepartment,
  normalizeDepartmentName
} from "@/lib/evaluation-scope";

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

  return {
    departments,
    evaluateeDepartments: departments.filter(isEvaluatableDepartment),
    periods,
    criteria,
    users,
    requirements
  };
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
  const evaluateeDepartments = departments.filter(isEvaluatableDepartment);
  const criterion =
    (await prisma.criterion.findFirst({ where: { name: "Общая оценка взаимодействия" } })) ||
    (await prisma.criterion.findFirst({ where: { isActive: true } }));
  const requirements = await getRequiredPairs(departments.map((department) => department.id));

  if (!selectedPeriod || !criterion) {
    return {
      periods,
      selectedPeriod: null,
      departments,
      evaluateeDepartments,
      requirements,
      evaluations: [],
      byEvaluatee: [],
      byEvaluator: [],
      companyAverage: null,
      lowScores: [],
      lowScoreRepeatCounts: {},
      missingCount: 0,
      expectedCount: 0,
      completion: [],
      dynamics: []
    };
  }

  const activeDepartmentIds = new Set(departments.map((department) => department.id));
  const evaluateeDepartmentIds = new Set(evaluateeDepartments.map((department) => department.id));
  const previousPeriod = periods.find(
    (period) =>
      period.year < selectedPeriod.year ||
      (period.year === selectedPeriod.year && period.month < selectedPeriod.month)
  );
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
      evaluateeDepartmentIds.has(evaluation.evaluateeDepartmentId)
  );
  const scoredEvaluations = evaluations.filter(
    (evaluation) => !evaluation.noInteraction && evaluation.score != null
  );
  const previousEvaluations = previousPeriod
    ? await prisma.evaluation.findMany({
        where: {
          periodId: previousPeriod.id,
          criterionId: criterion.id,
          noInteraction: false,
          score: { not: null }
        },
        select: { evaluateeDepartmentId: true, score: true }
      })
    : [];
  const previousLowEvaluations = await prisma.evaluation.findMany({
    where: {
      periodId: { not: selectedPeriod.id },
      criterionId: criterion.id,
      noInteraction: false,
      score: { lte: 9 }
    },
    select: {
      evaluatorDepartmentId: true,
      evaluatorUserId: true,
      evaluateeDepartmentId: true
    }
  });
  const lowScoreRepeatCounts = previousLowEvaluations.reduce<Record<string, number>>((acc, evaluation) => {
    const evaluatorId = evaluation.evaluatorDepartmentId || evaluation.evaluatorUserId || "director";
    const key = `${evaluatorId}:${evaluation.evaluateeDepartmentId}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const average = (scores: number[]) =>
    scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null;

  const evaluationKeys = new Set(
    evaluations
      .filter((evaluation) => evaluation.evaluatorDepartmentId)
      .map((evaluation) => `${evaluation.evaluatorDepartmentId}:${evaluation.evaluateeDepartmentId}`)
  );
  const departmentById = new Map(departments.map((department) => [department.id, department]));

  const byEvaluatee = evaluateeDepartments.map((department) => {
    const relevantEvaluations = scoredEvaluations.filter(
      (evaluation) => evaluation.evaluateeDepartmentId === department.id
    );
    const scores = relevantEvaluations.map((evaluation) => evaluation.score as number);
    const previousScores = previousEvaluations
      .filter((evaluation) => evaluation.evaluateeDepartmentId === department.id)
      .map((evaluation) => evaluation.score)
      .filter((score): score is number => score != null);
    const previousAverage = average(previousScores);
    const currentAverage = average(scores);
    const noInteractionCount = evaluations.filter(
      (evaluation) => evaluation.evaluateeDepartmentId === department.id && evaluation.noInteraction
    ).length;

    return {
      department,
      average: currentAverage,
      previousAverage,
      averageDelta: currentAverage != null && previousAverage != null ? currentAverage - previousAverage : null,
      count: scores.length,
      noInteractionCount,
      lowCount: scores.filter((score) => score <= 9).length,
      missingRequiredEvaluatorNames: requirements
        .filter(
          (requirement) =>
            requirement.evaluateeDepartmentId === department.id &&
            !evaluationKeys.has(`${requirement.evaluatorDepartmentId}:${requirement.evaluateeDepartmentId}`)
        )
        .map((requirement) => {
          const department = departmentById.get(requirement.evaluatorDepartmentId);
          return department ? departmentOptionLabel(department) : null;
        })
        .filter((name): name is string => Boolean(name))
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
    evaluateeDepartments,
    requirements,
    evaluations,
    byEvaluatee,
    byEvaluator,
    companyAverage: average(scoredEvaluations.map((evaluation) => evaluation.score as number)),
    lowScores: scoredEvaluations.filter((evaluation) => (evaluation.score as number) <= 9),
    lowScoreRepeatCounts,
    missingCount,
    expectedCount,
    completion,
    dynamics
  };
}

async function getRequiredPairs(activeDepartmentIds: string[]): Promise<RequirementPair[]> {
  const activeSet = new Set(activeDepartmentIds);
  const activeDepartments = await prisma.department.findMany({
    where: { id: { in: activeDepartmentIds } },
    select: { id: true, name: true }
  });
  const evaluateeSet = new Set(activeDepartments.filter(isEvaluatableDepartment).map((department) => department.id));
  const allRequirements = await prisma.evaluationRequirement.findMany();

  if (allRequirements.length === 0) {
    return activeDepartmentIds.flatMap((evaluatorDepartmentId) =>
      activeDepartmentIds
        .filter(
          (evaluateeDepartmentId) =>
            evaluateeSet.has(evaluateeDepartmentId) && evaluateeDepartmentId !== evaluatorDepartmentId
        )
        .map((evaluateeDepartmentId) => ({ evaluatorDepartmentId, evaluateeDepartmentId }))
    );
  }

  const pairs = allRequirements
    .filter(
      (requirement) =>
        requirement.isActive &&
        activeSet.has(requirement.evaluatorDepartmentId) &&
        evaluateeSet.has(requirement.evaluateeDepartmentId) &&
        requirement.evaluatorDepartmentId !== requirement.evaluateeDepartmentId
    )
    .map((requirement) => ({
      evaluatorDepartmentId: requirement.evaluatorDepartmentId,
      evaluateeDepartmentId: requirement.evaluateeDepartmentId
    }));

  const pairKeys = new Set(pairs.map((pair) => `${pair.evaluatorDepartmentId}:${pair.evaluateeDepartmentId}`));
  const fullCoverageEvaluateeIds = new Set(
    activeDepartments
      .filter((department) =>
        DEFAULT_FULL_COVERAGE_EVALUATEE_NAMES.some(
          (name) => normalizeDepartmentName(name) === normalizeDepartmentName(department.name)
        )
      )
      .filter(isEvaluatableDepartment)
      .map((department) => department.id)
  );

  for (const evaluateeDepartmentId of fullCoverageEvaluateeIds) {
    for (const evaluatorDepartmentId of activeDepartmentIds) {
      const key = `${evaluatorDepartmentId}:${evaluateeDepartmentId}`;
      if (evaluatorDepartmentId === evaluateeDepartmentId || pairKeys.has(key)) continue;
      pairs.push({ evaluatorDepartmentId, evaluateeDepartmentId });
      pairKeys.add(key);
    }
  }

  return pairs;
}
