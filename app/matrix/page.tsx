import AppShell from "@/components/app-shell";
import DepartmentFilter from "@/components/department-filter";
import MatrixClient from "@/components/matrix-client";
import PeriodFilter from "@/components/period-filter";
import { Role } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { departmentOptionLabel } from "@/lib/department-decodings";
import { periodLabel } from "@/lib/format";
import { getMatrixMetrics } from "@/lib/metrics";

export default async function MatrixPage({
  searchParams
}: {
  searchParams: { period?: string; department?: string };
}) {
  const user = await requireUser([Role.ADMIN, Role.ANALYST, Role.LEADER, Role.DIRECTOR, Role.VIEWER]);
  const metrics = await getMatrixMetrics(searchParams.period);
  const leaderDepartmentId = user.role === Role.LEADER ? user.departmentId : null;
  const canViewComments =
    user.role === Role.ADMIN || user.role === Role.DIRECTOR || user.role === Role.LEADER;
  const selectedDepartment = leaderDepartmentId || searchParams.department;
  const columnDepartments = selectedDepartment
    ? metrics.evaluateeDepartments.filter((department) => department.id === selectedDepartment)
    : metrics.evaluateeDepartments;
  const rowDepartments = metrics.departments;
  const rowDepartmentIds = new Set(rowDepartments.map((department) => department.id));
  const columnDepartmentIds = new Set(columnDepartments.map((department) => department.id));
  const evaluations = metrics.evaluations
    .filter(
      (evaluation) =>
        evaluation.evaluatorDepartmentId &&
        evaluation.evaluatorDepartment &&
        rowDepartmentIds.has(evaluation.evaluatorDepartmentId) &&
        columnDepartmentIds.has(evaluation.evaluateeDepartmentId)
    )
    .map((evaluation) => ({
      id: evaluation.id,
      evaluatorDepartmentId: evaluation.evaluatorDepartmentId as string,
      evaluateeDepartmentId: evaluation.evaluateeDepartmentId,
      evaluatorName: departmentOptionLabel(evaluation.evaluatorDepartment!),
      evaluateeName: departmentOptionLabel(evaluation.evaluateeDepartment),
      score: evaluation.score,
      noInteraction: evaluation.noInteraction,
      deviationCategories: evaluation.deviationCategories,
      comment: evaluation.comment,
      authorName: evaluation.author.name,
      updatedAt: evaluation.updatedAt.toISOString()
    }));

  const matrixDepartmentIds = new Set(columnDepartments.map((department) => department.id));
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
        (!selectedDepartment || evaluation.evaluateeDepartmentId === selectedDepartment)
    )
    .map((evaluation) => ({
      id: evaluation.id,
      evaluatorName: evaluation.evaluatorDepartment
        ? departmentOptionLabel(evaluation.evaluatorDepartment)
        : evaluation.evaluatorUser?.name || "Директор",
      evaluateeName: departmentOptionLabel(evaluation.evaluateeDepartment),
      score: evaluation.score,
      deviationCategories: evaluation.deviationCategories,
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
  const departmentOptions = metrics.evaluateeDepartments.map(({ id, name, shortName }) => ({ id, name, shortName }));
  const rowDepartmentOptions = rowDepartments.map(({ id, name, shortName }) => ({
    id,
    name,
    shortName
  }));
  const columnDepartmentOptions = columnDepartments.map(({ id, name, shortName }) => ({
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
          {!leaderDepartmentId ? <DepartmentFilter departments={departmentOptions} /> : null}
        </div>
      </div>
      <MatrixClient
        rowDepartments={rowDepartmentOptions}
        columnDepartments={columnDepartmentOptions}
        evaluations={evaluations}
        summaries={summaries}
        lowComments={canViewComments ? lowComments : []}
        canViewComments={canViewComments}
      />
    </AppShell>
  );
}
