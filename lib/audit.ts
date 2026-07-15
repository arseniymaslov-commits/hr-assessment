import { prisma } from "@/lib/prisma";

type AuditUser = {
  id?: string | null;
  name?: string | null;
};

export async function writeAuditLog({
  action,
  summary,
  details,
  user,
  request
}: {
  action: string;
  summary: string;
  details?: string;
  user?: AuditUser | null;
  request?: Request | null;
}) {
  const meta = request
    ? [
        `IP: ${request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "не определен"}`,
        `User-Agent: ${request.headers.get("user-agent") || "не определен"}`
      ].join("; ")
    : "";
  const fullDetails = [details, meta].filter(Boolean).join("\n");

  await prisma.auditLog.create({
    data: {
      action,
      summary,
      details: fullDetails || null,
      userId: user?.id || null,
      userName: user?.name || null
    }
  });
}
