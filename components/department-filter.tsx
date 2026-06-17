"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { departmentOptionLabel } from "@/lib/department-decodings";

type Department = {
  id: string;
  name: string;
  shortName?: string | null;
};

export default function DepartmentFilter({ departments }: { departments: Department[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const value = searchParams.get("department") || "";

  function changeDepartment(departmentId: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (departmentId) params.set("department", departmentId);
    else params.delete("department");
    router.push(`?${params.toString()}`);
  }

  return (
    <select
      className="focus-ring rounded-lg border border-line bg-white px-3 py-2 text-sm"
      value={value}
      onChange={(event) => changeDepartment(event.target.value)}
    >
      <option value="">Все подразделения</option>
      {departments.map((department) => (
        <option key={department.id} value={department.id}>
          {departmentOptionLabel(department)}
        </option>
      ))}
    </select>
  );
}
