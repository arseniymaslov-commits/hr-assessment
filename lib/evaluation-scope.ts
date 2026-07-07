export const NON_EVALUATED_DEPARTMENT_NAMES = new Set([
  "ОВА",
  "КРО",
  "СКП",
  "СВКА"
]);

export const DEFAULT_REQUIRED_EVALUATOR_NAMES = [
  "ОВА",
  "КРО",
  "УЧР",
  "ПЭО",
  "СКП",
  "Бухгалтерия",
  "Главный бухгалтер"
];

export const DEFAULT_FULL_COVERAGE_EVALUATEE_NAMES = ["ОЦП"];

export function normalizeDepartmentName(name: string) {
  return name.trim().toLocaleLowerCase("ru-RU");
}

export function isEvaluatableDepartmentName(name: string) {
  return !NON_EVALUATED_DEPARTMENT_NAMES.has(name.trim());
}

export function isEvaluatableDepartment<T extends { name: string }>(department: T) {
  return isEvaluatableDepartmentName(department.name);
}
