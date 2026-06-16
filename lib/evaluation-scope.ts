export const NON_EVALUATED_DEPARTMENT_NAMES = new Set([
  "СВКА",
  "ОВА",
  "КРО",
  "ТД",
  "КД",
  "ЗГД",
  "Securi Force",
  "Финансы",
  "Финансовая дирекция",
  "Заместитель финансового директора"
]);

export function isEvaluatableDepartmentName(name: string) {
  return !NON_EVALUATED_DEPARTMENT_NAMES.has(name.trim());
}

export function isEvaluatableDepartment<T extends { name: string }>(department: T) {
  return isEvaluatableDepartmentName(department.name);
}
