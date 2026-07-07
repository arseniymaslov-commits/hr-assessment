import { prisma } from "@/lib/prisma";
import { departmentOptionLabel } from "@/lib/department-decodings";
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

  const evaluateeDepartments = departments.filter(isEvaluatableDepartment);
  const evaluateeDepartmentIds = new Set(evaluateeDepartments.map((department) => department.id));

  return {
    departments,
    evaluateeDepartments,
    periods,
    criteria,
    users,
    requirements: requirements.filter((requirement) => evaluateeDepartmentIds.has(requirement.evaluateeDepartmentId))
  };
}

export async function getPeriodMetrics(periodId?: string) {
  const periods = await prisma.period.findMany({
    orderBy: [{ year: "desc" }, { month: "desc" }]
  });
  const selectedPeriod = periodId
    ? periods.find((period) => period.id === periodId) || periods[0]
    : periods.find((period) => period.status === "OPEN") || periods[0];

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
  const [allEvaluations, previousEvaluations, previousLowEvaluations, dynamicAverages] = await Promise.all([
    prisma.evaluation.findMany({
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
    }),
    previousPeriod
      ? prisma.evaluation.findMany({
          where: {
            periodId: previousPeriod.id,
            criterionId: criterion.id,
            noInteraction: false,
            score: { not: null }
          },
          select: { evaluateeDepartmentId: true, score: true }
        })
      : Promise.resolve([]),
    prisma.evaluation.findMany({
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
    }),
    prisma.evaluation.groupBy({
      by: ["periodId"],
      where: {
        criterionId: criterion.id,
        noInteraction: false,
        score: { not: null }
      },
      _avg: { score: true }
    })
  ]);
  const evaluations = allEvaluations.filter(
    (evaluation) =>
      (evaluation.evaluatorDepartmentId == null ||
        activeDepartmentIds.has(evaluation.evaluatorDepartmentId)) &&
      evaluateeDepartmentIds.has(evaluation.evaluateeDepartmentId)
  );
  const scoredEvaluations = evaluations.filter(
    (evaluation) => !evaluation.noInteraction && evaluation.score != null
  );
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
  const scoredByEvaluatee = new Map<string, typeof scoredEvaluations>();
  const allByEvaluatee = new Map<string, typeof evaluations>();
  const previousScoresByEvaluatee = new Map<string, number[]>();
  const scoredByEvaluator = new Map<string, typeof scoredEvaluations>();
  const allByEvaluator = new Map<string, typeof evaluations>();
  const requirementsByEvaluatee = new Map<string, RequirementPair[]>();
  const requirementsByEvaluator = new Map<string, RequirementPair[]>();

  for (const evaluation of scoredEvaluations) {
    const evaluateeRows = scoredByEvaluatee.get(evaluation.evaluateeDepartmentId) || [];
    evaluateeRows.push(evaluation);
    scoredByEvaluatee.set(evaluation.evaluateeDepartmentId, evaluateeRows);

    if (evaluation.evaluatorDepartmentId) {
      const evaluatorRows = scoredByEvaluator.get(evaluation.evaluatorDepartmentId) || [];
      evaluatorRows.push(evaluation);
      scoredByEvaluator.set(evaluation.evaluatorDepartmentId, evaluatorRows);
    }
  }

  for (const evaluation of evaluations) {
    const evaluateeRows = allByEvaluatee.get(evaluation.evaluateeDepartmentId) || [];
    evaluateeRows.push(evaluation);
    allByEvaluatee.set(evaluation.evaluateeDepartmentId, evaluateeRows);

    if (evaluation.evaluatorDepartmentId) {
      const evaluatorRows = allByEvaluator.get(evaluation.evaluatorDepartmentId) || [];
      evaluatorRows.push(evaluation);
      allByEvaluator.set(evaluation.evaluatorDepartmentId, evaluatorRows);
    }
  }

  for (const evaluation of previousEvaluations) {
    if (evaluation.score == null) continue;
    const scores = previousScoresByEvaluatee.get(evaluation.evaluateeDepartmentId) || [];
    scores.push(evaluation.score);
    previousScoresByEvaluatee.set(evaluation.evaluateeDepartmentId, scores);
  }

  for (const requirement of requirements) {
    const evaluateeRows = requirementsByEvaluatee.get(requirement.evaluateeDepartmentId) || [];
    evaluateeRows.push(requirement);
    requirementsByEvaluatee.set(requirement.evaluateeDepartmentId, evaluateeRows);

    const evaluatorRows = requirementsByEvaluator.get(requirement.evaluatorDepartmentId) || [];
    evaluatorRows.push(requirement);
    requirementsByEvaluator.set(requirement.evaluatorDepartmentId, evaluatorRows);
  }

  const byEvaluatee = evaluateeDepartments.map((department) => {
    const relevantEvaluations = scoredByEvaluatee.get(department.id) || [];
    const scores = relevantEvaluations.map((evaluation) => evaluation.score as number);
    const previousScores = previousScoresByEvaluatee.get(department.id) || [];
    const previousAverage = average(previousScores);
    const currentAverage = average(scores);
    const noInteractionCount = (allByEvaluatee.get(department.id) || []).filter(
      (evaluation) => evaluation.noInteraction
    ).length;

    return {
      department,
      average: currentAverage,
      previousAverage,
      averageDelta: currentAverage != null && previousAverage != null ? currentAverage - previousAverage : null,
      count: scores.length,
      noInteractionCount,
      lowCount: scores.filter((score) => score <= 9).length,
      missingRequiredEvaluatorNames: (requirementsByEvaluatee.get(department.id) || [])
        .filter(
          (requirement) =>
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
    const relevantEvaluations = scoredByEvaluator.get(department.id) || [];
    const scores = relevantEvaluations.map((evaluation) => evaluation.score as number);
    const noInteractionCount = (allByEvaluator.get(department.id) || []).filter(
      (evaluation) => evaluation.noInteraction
    ).length;

    return {
      department,
      average: average(scores),
      count: scores.length,
      noInteractionCount
    };
  });

  const completion = departments.map((department) => {
    const requiredPairs = requirementsByEvaluator.get(department.id) || [];
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

  const dynamicAverageByPeriod = new Map(dynamicAverages.map((row) => [row.periodId, row._avg.score]));
  const dynamics = periods
    .slice()
    .reverse()
    .map((period) => ({
      period,
      average: dynamicAverageByPeriod.get(period.id) ?? null
    }));

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
