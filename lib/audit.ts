import { prisma } from "@/lib/prisma";

type AuditUser = {
  id?: string | null;
  name?: string | null;
};

export async function writeAuditLog({
  action,
  summary,
  details,
  user
}: {
  action: string;
  summary: string;
  details?: string;
  user?: AuditUser | null;
}) {
  await prisma.auditLog.create({
    data: {
      action,
      summary,
      details,
      userId: user?.id || null,
      userName: user?.name || null
    }
  });
}
