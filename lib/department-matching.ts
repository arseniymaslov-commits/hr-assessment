import { normalizeDepartmentName } from "@/lib/evaluation-scope";

type DepartmentLike = {
  id: string;
  name: string;
  shortName?: string | null;
};

const stopWords = new Set([
  "главный",
  "главная",
  "руководитель",
  "начальник",
  "директор",
  "отдел",
  "служба",
  "управление",
  "департамент",
  "заместитель"
]);

function tokens(value: string) {
  return normalizeDepartmentName(value)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !stopWords.has(token));
}

function haystack(department: DepartmentLike) {
  return normalizeDepartmentName(`${department.name} ${department.shortName || ""}`);
}

export function resolveEvaluateeDepartmentId(
  sourceDepartment: DepartmentLike | null | undefined,
  evaluateeDepartments: DepartmentLike[]
) {
  if (!sourceDepartment) return null;

  const sourceTokens = tokens(`${sourceDepartment.name} ${sourceDepartment.shortName || ""}`);
  if (sourceTokens.includes("бухгалтер")) {
    const accounting = evaluateeDepartments.find((department) => {
      const text = haystack(department);
      return text.includes("бухгалтерия") || text.includes("сауп");
    });
    if (accounting) return accounting.id;
  }

  if (evaluateeDepartments.some((department) => department.id === sourceDepartment.id)) {
    return sourceDepartment.id;
  }

  const sourceName = normalizeDepartmentName(sourceDepartment.name);
  const sourceShortName = normalizeDepartmentName(sourceDepartment.shortName || "");

  const exact = evaluateeDepartments.find((department) => {
    const departmentName = normalizeDepartmentName(department.name);
    const departmentShortName = normalizeDepartmentName(department.shortName || "");
    return (
      departmentName === sourceName ||
      Boolean(sourceShortName && departmentShortName === sourceShortName) ||
      Boolean(sourceName && departmentShortName === sourceName)
    );
  });
  if (exact) return exact.id;

  if (!sourceTokens.length) return null;

  const scored = evaluateeDepartments
    .map((department) => {
      const text = haystack(department);
      const score = sourceTokens.reduce((sum, token) => sum + (text.includes(token) ? 1 : 0), 0);
      return { department, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.department.id || null;
}
