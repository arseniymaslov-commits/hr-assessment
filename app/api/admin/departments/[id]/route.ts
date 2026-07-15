import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (user?.role !== Role.ADMIN) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const department = await prisma.department.update({
    where: { id: params.id },
    data: { isActive: false }
  });

  await writeAuditLog({
    action: "department.disable",
    summary: "Подразделение отключено",
    details: `${department.name} — ${department.shortName}`,
    user,
    request
  });

  return NextResponse.json({ message: "Подразделение удалено из активного списка" });
}
