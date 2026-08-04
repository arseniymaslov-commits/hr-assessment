import { unstable_noStore as noStore } from "next/cache";
import { prisma } from "@/lib/prisma";
import { departmentOptionLabel } from "@/lib/department-decodings";
import { isMissingEvaluation } from "@/lib/evaluation-status";
import { isEvaluatableDepartment, isMandatoryEvaluateeDepartment } from "@/lib/evaluation-scope";
import { ensureScheduledAssessmentPeriod } from "@/lib/period-automation";

type RequirementPair = {
  evaluatorDepartmentId: string;
  evaluateeDepartmentId: string;
};

type RequirementDepartment = {
  id: string;
  name: string;
};

type MetricEvaluationKey = {
  evaluatorDepartmentId?: string | null;
  evaluatorUserId?: string | null;
  evaluateeDepartmentId: string;
  criterionId: string;
  updatedAt: Date;
};

async function getPeriodSelection(periodId?: string) {
  const scheduledPeriod = periodId ? null : await ensureScheduledAssessmentPeriod();
  const periods = await prisma.period.findMany({
    orderBy: [{ year: "desc" }, { month: "desc" }]
  });
  const selectedPeriod = periodId
    ? periods.find((period) => period.id === periodId) || periods[0]
    : scheduledPeriod
      ? periods.find((period) => period.id === scheduledPeriod.id) || scheduledPeriod
      : periods.find((period) => period.status === "OPEN") || periods[0];

  return { periods, selectedPeriod };
}

async function getActiveDepartments() {
  const departments = await prisma.department.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" }
  });

  return {
    departments,
    evaluateeDepartments: departments.filter(isEvaluatableDepartment)
  };
}

async function getPrimaryCriterion() {
  return (
    (await prisma.criterion.findFirst({ where: { name: "Общая оценка взаимодействия" } })) ||
    (await prisma.criterion.findFirst({ where: { isActive: true } }))
  );
}

function average(scores: number[]) {
  return scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null;
}

function evaluationPairKey(evaluation: MetricEvaluationKey) {
  return `${evaluation.evaluatorDepartmentId || evaluation.evaluatorUserId || "director"}:${evaluation.evaluateeDepartmentId}`;
}

function pickMetricEvaluations<T extends MetricEvaluationKey>(evaluations: T[], primaryCriterionId: string) {
  const byPair = new Map<string, T>();

  for (const evaluation of evaluations) {
    const key = evaluationPairKey(evaluation);
    const current = byPair.get(key);
    if (!current) {
      byPair.set(key, evaluation);
      continue;
    }

    const currentIsPrimary = current.criterionId === primaryCriterionId;
    const nextIsPrimary = evaluation.criterionId === primaryCriterionId;
    if (
      (!currentIsPrimary && nextIsPrimary) ||
      (currentIsPrimary === nextIsPrimary && evaluation.updatedAt > current.updatedAt)
    ) {
      byPair.set(key, evaluation);
    }
  }

  return Array.from(byPair.values());
}

export async function getReferenceData(options: { ensurePeriod?: boolean } = {}) {
  noStore();
  if (options.ensurePeriod !== false) {
    await ensureScheduledAssessmentPeriod();
  }
  const [departments, periods, criteria, users] = await Promise.all([
    prisma.department.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      include: {
        directorAssignments: {
          select: { userId: true }
        }
      }
    }),
    prisma.period.findMany({
      orderBy: [{ year: "desc" }, { month: "desc" }],
      include: {
        requests: {
          orderBy: [{ scheduledAt: "desc" }, { createdAt: "desc" }],
          take: 1,
          select: { scheduledAt: true, createdAt: true }
        }
      }
    }),
    prisma.criterion.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        position: true,
        departmentId: true,
        mustChangePassword: true,
        isActive: true,
        receivesNotifications: true,
        department: true,
        directorDepartments: {
          include: {
            department: true
          }
        }
      }
    })
  ]);

  const evaluateeDepartments = departments.filter(isEvaluatableDepartment);
  const requirements = getRequiredPairs(departments);

  return {
    departments,
    evaluateeDepartments,
    periods,
    criteria,
    users,
    requirements
  };
}

export async function getPeriodMetrics(periodId?: string) {
  noStore();
  const [{ periods, selectedPeriod }, { departments, evaluateeDepartments }, criterion] = await Promise.all([
    getPeriodSelection(periodId),
    getActiveDepartments(),
    getPrimaryCriterion()
  ]);
  const requirements = getRequiredPairs(departments);

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
  const [rawAllEvaluations, rawPreviousEvaluations, previousLowEvaluations, dynamicAverages] = await Promise.all([
    prisma.evaluation.findMany({
      where: { periodId: selectedPeriod.id },
      select: {
        id: true,
        periodId: true,
        period: true,
        evaluatorDepartmentId: true,
        evaluatorDepartment: {
          select: { id: true, name: true, shortName: true }
        },
        evaluatorUserId: true,
        evaluatorUser: {
          select: { id: true, name: true }
        },
        evaluateeDepartmentId: true,
        evaluateeDepartment: {
          select: { id: true, name: true, shortName: true }
        },
        criterionId: true,
        criterion: {
          select: { id: true, name: true }
        },
        score: true,
        noInteraction: true,
        deviationCategories: true,
        comment: true,
        authorId: true,
        author: {
          select: { id: true, name: true }
        },
        createdAt: true,
        updatedAt: true
      },
      orderBy: { updatedAt: "desc" }
    }),
    previousPeriod
      ? prisma.evaluation.findMany({
          where: {
            periodId: previousPeriod.id,
            noInteraction: false,
            score: { not: null }
          },
          select: {
            evaluatorDepartmentId: true,
            evaluatorUserId: true,
            evaluateeDepartmentId: true,
            criterionId: true,
            score: true,
            updatedAt: true
          }
        })
      : Promise.resolve([]),
    prisma.evaluation.findMany({
      where: {
        periodId: { not: selectedPeriod.id },
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
        noInteraction: false,
        score: { not: null }
      },
      _avg: { score: true }
    })
  ]);
  const allEvaluations = pickMetricEvaluations(rawAllEvaluations, criterion.id);
  const previousEvaluations = pickMetricEvaluations(rawPreviousEvaluations, criterion.id);
  const evaluations = allEvaluations
    .filter(
      (evaluation) =>
        (evaluation.evaluatorDepartmentId == null ||
          activeDepartmentIds.has(evaluation.evaluatorDepartmentId)) &&
        evaluateeDepartmentIds.has(evaluation.evaluateeDepartmentId)
    )
    .map((evaluation) =>
      isMissingEvaluation(evaluation)
        ? { ...evaluation, score: null, noInteraction: false, deviationCategories: [] }
        : evaluation
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

  const evaluationKeys = new Set(
    evaluations
      .filter(
        (evaluation) =>
          evaluation.evaluatorDepartmentId && (evaluation.noInteraction || evaluation.score != null)
      )
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

export async function getCompletionMetrics(periodId?: string) {
  noStore();
  const [{ periods, selectedPeriod }, { departments }, criterion] = await Promise.all([
    getPeriodSelection(periodId),
    getActiveDepartments(),
    getPrimaryCriterion()
  ]);
  const requirements = getRequiredPairs(departments);

  if (!selectedPeriod || !criterion) {
    return {
      periods,
      selectedPeriod: null,
      completion: [],
      expectedCount: 0,
      missingCount: 0
    };
  }

  const activeDepartmentIds = new Set(departments.map((department) => department.id));
  const rawEvaluations = await prisma.evaluation.findMany({
    where: { periodId: selectedPeriod.id },
    select: {
      evaluatorDepartmentId: true,
      evaluatorUserId: true,
      evaluateeDepartmentId: true,
      criterionId: true,
      score: true,
      noInteraction: true,
      comment: true,
      updatedAt: true
    }
  });
  const evaluations = pickMetricEvaluations(rawEvaluations, criterion.id).filter(
    (evaluation) =>
      evaluation.evaluatorDepartmentId &&
      activeDepartmentIds.has(evaluation.evaluatorDepartmentId) &&
      activeDepartmentIds.has(evaluation.evaluateeDepartmentId)
  );
  const evaluationKeys = new Set(
    evaluations
      .filter((evaluation) => evaluation.evaluatorDepartmentId && (evaluation.noInteraction || evaluation.score != null))
      .map((evaluation) => `${evaluation.evaluatorDepartmentId}:${evaluation.evaluateeDepartmentId}`)
  );
  const requirementsByEvaluator = new Map<string, RequirementPair[]>();

  for (const requirement of requirements) {
    const rows = requirementsByEvaluator.get(requirement.evaluatorDepartmentId) || [];
    rows.push(requirement);
    requirementsByEvaluator.set(requirement.evaluatorDepartmentId, rows);
  }

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
  const filledRequiredCount = requirements.filter((requirement) =>
    evaluationKeys.has(`${requirement.evaluatorDepartmentId}:${requirement.evaluateeDepartmentId}`)
  ).length;

  return {
    periods,
    selectedPeriod,
    completion,
    expectedCount: requirements.length,
    missingCount: Math.max(0, requirements.length - filledRequiredCount)
  };
}

export async function getMatrixMetrics(periodId?: string) {
  noStore();
  const [{ periods, selectedPeriod }, { departments, evaluateeDepartments }, criterion] = await Promise.all([
    getPeriodSelection(periodId),
    getActiveDepartments(),
    getPrimaryCriterion()
  ]);

  if (!selectedPeriod || !criterion) {
    return {
      periods,
      selectedPeriod: null,
      departments,
      evaluateeDepartments,
      evaluations: [],
      byEvaluatee: [],
      lowScores: []
    };
  }

  const activeDepartmentIds = new Set(departments.map((department) => department.id));
  const evaluateeDepartmentIds = new Set(evaluateeDepartments.map((department) => department.id));
  const rawEvaluations = await prisma.evaluation.findMany({
    where: { periodId: selectedPeriod.id },
    select: {
      id: true,
      periodId: true,
      evaluatorDepartmentId: true,
      evaluatorDepartment: {
        select: { id: true, name: true, shortName: true }
      },
      evaluatorUserId: true,
      evaluatorUser: {
        select: { id: true, name: true }
      },
      evaluateeDepartmentId: true,
      evaluateeDepartment: {
        select: { id: true, name: true, shortName: true }
      },
      criterionId: true,
      score: true,
      noInteraction: true,
      deviationCategories: true,
      comment: true,
      author: {
        select: { id: true, name: true }
      },
      updatedAt: true
    },
    orderBy: { updatedAt: "desc" }
  });
  const evaluations = pickMetricEvaluations(rawEvaluations, criterion.id)
    .filter(
      (evaluation) =>
        evaluation.evaluatorDepartmentId &&
        activeDepartmentIds.has(evaluation.evaluatorDepartmentId) &&
        evaluateeDepartmentIds.has(evaluation.evaluateeDepartmentId)
    )
    .map((evaluation) =>
      isMissingEvaluation(evaluation)
        ? { ...evaluation, score: null, noInteraction: false, deviationCategories: [] }
        : evaluation
    );
  const scoredEvaluations = evaluations.filter(
    (evaluation) => !evaluation.noInteraction && evaluation.score != null
  );
  const scoredByEvaluatee = new Map<string, typeof scoredEvaluations>();
  const allByEvaluatee = new Map<string, typeof evaluations>();

  for (const evaluation of scoredEvaluations) {
    const rows = scoredByEvaluatee.get(evaluation.evaluateeDepartmentId) || [];
    rows.push(evaluation);
    scoredByEvaluatee.set(evaluation.evaluateeDepartmentId, rows);
  }

  for (const evaluation of evaluations) {
    const rows = allByEvaluatee.get(evaluation.evaluateeDepartmentId) || [];
    rows.push(evaluation);
    allByEvaluatee.set(evaluation.evaluateeDepartmentId, rows);
  }

  const byEvaluatee = evaluateeDepartments.map((department) => {
    const relevantEvaluations = scoredByEvaluatee.get(department.id) || [];
    const scores = relevantEvaluations.map((evaluation) => evaluation.score as number);
    const noInteractionCount = (allByEvaluatee.get(department.id) || []).filter(
      (evaluation) => evaluation.noInteraction
    ).length;

    return {
      department,
      average: average(scores),
      count: scores.length,
      noInteractionCount,
      lowCount: scores.filter((score) => score <= 9).length
    };
  });

  return {
    periods,
    selectedPeriod,
    departments,
    evaluateeDepartments,
    evaluations,
    byEvaluatee,
    lowScores: scoredEvaluations.filter((evaluation) => (evaluation.score as number) <= 9)
  };
}

export async function getEvaluationScreenMetrics(periodId?: string) {
  noStore();
  const [{ periods, selectedPeriod }, { departments, evaluateeDepartments }, criterion] = await Promise.all([
    getPeriodSelection(periodId),
    getActiveDepartments(),
    getPrimaryCriterion()
  ]);

  if (!selectedPeriod || !criterion) {
    return {
      periods,
      selectedPeriod: null,
      evaluations: []
    };
  }

  const activeDepartmentIds = new Set(departments.map((department) => department.id));
  const evaluateeDepartmentIds = new Set(evaluateeDepartments.map((department) => department.id));
  const rawEvaluations = await prisma.evaluation.findMany({
    where: { periodId: selectedPeriod.id },
    select: {
      id: true,
      periodId: true,
      evaluatorDepartmentId: true,
      evaluatorDepartment: {
        select: { id: true, name: true, shortName: true }
      },
      evaluatorUserId: true,
      evaluatorUser: {
        select: { id: true, name: true }
      },
      evaluateeDepartmentId: true,
      evaluateeDepartment: {
        select: { id: true, name: true, shortName: true }
      },
      criterionId: true,
      score: true,
      noInteraction: true,
      deviationCategories: true,
      comment: true,
      author: {
        select: { id: true, name: true }
      },
      updatedAt: true
    },
    orderBy: { updatedAt: "desc" }
  });
  const evaluations = pickMetricEvaluations(rawEvaluations, criterion.id)
    .filter(
      (evaluation) =>
        (evaluation.evaluatorDepartmentId == null ||
          activeDepartmentIds.has(evaluation.evaluatorDepartmentId)) &&
        evaluateeDepartmentIds.has(evaluation.evaluateeDepartmentId)
    )
    .map((evaluation) =>
      isMissingEvaluation(evaluation)
        ? { ...evaluation, score: null, noInteraction: false, deviationCategories: [] }
        : evaluation
    );

  return {
    periods,
    selectedPeriod,
    evaluations
  };
}

function getRequiredPairs(activeDepartments: RequirementDepartment[]): RequirementPair[] {
  const activeDepartmentIds = activeDepartments.map((department) => department.id);
  const mandatoryEvaluateeSet = new Set(
    activeDepartments.filter(isMandatoryEvaluateeDepartment).map((department) => department.id)
  );
  return activeDepartmentIds.flatMap((evaluatorDepartmentId) =>
    activeDepartmentIds
      .filter(
        (evaluateeDepartmentId) =>
          mandatoryEvaluateeSet.has(evaluateeDepartmentId) && evaluateeDepartmentId !== evaluatorDepartmentId
      )
      .map((evaluateeDepartmentId) => ({ evaluatorDepartmentId, evaluateeDepartmentId }))
  );
}
