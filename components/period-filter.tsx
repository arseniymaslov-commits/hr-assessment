"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { periodLabel } from "@/lib/format";

type Period = {
  id: string;
  month: number;
  year: number;
  status: "OPEN" | "CLOSED";
};

export default function PeriodFilter({ periods, selectedPeriodId }: { periods: Period[]; selectedPeriodId?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function changePeriod(periodId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", periodId);
    router.push(`?${params.toString()}`);
  }

  return (
    <select
      className="focus-ring rounded-lg border border-line bg-white px-3 py-2 text-sm"
      value={selectedPeriodId || ""}
      onChange={(event) => changePeriod(event.target.value)}
    >
      {periods.map((period) => (
        <option key={period.id} value={period.id}>
          {periodLabel(period)} · {period.status === "OPEN" ? "открыт" : "закрыт"}
        </option>
      ))}
    </select>
  );
}
