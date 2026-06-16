import AppShell from "@/components/app-shell";
import DepartmentFilter from "@/components/department-filter";
import MatrixClient from "@/components/matrix-client";
import PeriodFilter from "@/components/period-filter";
import { Role } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { periodLabel } from "@/lib/format";
import { getPeriodMetrics } from "@/lib/metrics";

export default async function MatrixPage({
  searchParams
}: {
  searchParams: { period?: string; department?: string };
}) {
  const user = await requireUser([Role.ADMIN, Role.ANALYST, Role.LEADER, Role.DIRECTOR, Role.VIEWER]);
  const metrics = await getPeriodMetrics(searchParams.period);
  const selectedDepartment = searchParams.department;
  const departments = selectedDepartment
    ? metrics.departments.filter((department) => department.id === selectedDepartment)
    : metrics.departments;
  const visibleDepartmentIds = new Set(departments.map((department) => department.id));
  const evaluations = metrics.evaluations
    .filter(
      (evaluation) =>
        evaluation.evaluatorDepartmentId &&
        evaluation.evaluatorDepartment &&
        (!selectedDepartment ||
          evaluation.evaluateeDepartmentId === selectedDepartment ||
          evaluation.evaluatorDepartmentId === selectedDepartment) &&
        (visibleDepartmentIds.has(evaluation.evaluateeDepartmentId) ||
          visibleDepartmentIds.has(evaluation.evaluatorDepartmentId))
    )
    .map((evaluation) => ({
      id: evaluation.id,
      evaluatorDepartmentId: evaluation.evaluatorDepartmentId as string,
      evaluateeDepartmentId: evaluation.evaluateeDepartmentId,
      evaluatorName: evaluation.evaluatorDepartment!.name,
      evaluateeName: evaluation.evaluateeDepartment.name,
      score: evaluation.score,
      noInteraction: evaluation.noInteraction,
      comment: evaluation.comment,
      authorName: evaluation.author.name,
      updatedAt: evaluation.updatedAt.toISOString()
    }));

  const matrixDepartments = selectedDepartment ? metrics.departments : departments;
  const matrixDepartmentIds = new Set(matrixDepartments.map((department) => department.id));
  const summaries = metrics.byEvaluatee
    .filter((row) => matrixDepartmentIds.has(row.department.id))
    .map((row) => ({
      departmentId: row.department.id,
      average: row.average,
      count: row.count,
      lowCount: row.lowCount
    }));
  const lowComments = metrics.lowScores
    .filter(
      (evaluation) =>
        evaluation.evaluatorDepartment &&
        matrixDepartmentIds.has(evaluation.evaluateeDepartmentId) &&
        (!selectedDepartment ||
          evaluation.evaluateeDepartmentId === selectedDepartment ||
          evaluation.evaluatorDepartmentId === selectedDepartment)
    )
    .map((evaluation) => ({
      id: evaluation.id,
      evaluatorName: evaluation.evaluatorDepartment?.name || evaluation.evaluatorUser?.name || "Директор",
      evaluateeName: evaluation.evaluateeDepartment.name,
      score: evaluation.score,
      comment: evaluation.comment,
      authorName: evaluation.author.name,
      updatedAt: evaluation.updatedAt.toISOString()
    }));
  const periodOptions = metrics.periods.map(({ id, month, year, status }) => ({
    id,
    month,
    year,
    status
  }));
  const departmentOptions = metrics.departments.map(({ id, name }) => ({ id, name }));
  const matrixDepartmentOptions = matrixDepartments.map(({ id, name, shortName }) => ({
    id,
    name,
    shortName
  }));

  return (
    <AppShell user={user}>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Матрица взаимодействия</h1>
          <p className="mt-1 text-sm text-muted">
            {metrics.selectedPeriod ? periodLabel(metrics.selectedPeriod) : "Период не выбран"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <PeriodFilter periods={periodOptions} selectedPeriodId={metrics.selectedPeriod?.id} />
          <DepartmentFilter departments={departmentOptions} />
        </div>
      </div>
      <MatrixClient departments={matrixDepartmentOptions} evaluations={evaluations} summaries={summaries} lowComments={lowComments} />
    </AppShell>
  );
}
