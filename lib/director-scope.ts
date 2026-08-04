import { Role } from "@prisma/client";

type UserWithDirectorDepartments = {
  role: Role;
  directorDepartments?: Array<{
    departmentId?: string | null;
    department?: { id: string } | null;
  }>;
};

export function getDirectorDepartmentIds(user: UserWithDirectorDepartments) {
  if (user.role !== Role.DIRECTOR) return [];

  return Array.from(
    new Set(
      (user.directorDepartments || [])
        .map((assignment) => assignment.departmentId || assignment.department?.id || "")
        .filter(Boolean)
    )
  );
}
