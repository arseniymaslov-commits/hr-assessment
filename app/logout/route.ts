import { NextResponse } from "next/server";
import { clearSessionCookie, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

function getRedirectBaseUrl(request: Request) {
  if (process.env.APP_URL) return process.env.APP_URL;

  const requestUrl = new URL(request.url);
  const host = request.headers.get("host") || requestUrl.host;
  const isLocalhost = host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.startsWith("[::1]");
  const protocol = isLocalhost ? "http" : request.headers.get("x-forwarded-proto") || requestUrl.protocol.replace(":", "");

  return `${protocol}://${host}`;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (user) {
    await writeAuditLog({
      action: "auth.logout",
      summary: "Выход из системы",
      details: `Email: ${user.email}`,
      user,
      request
    });
  }
  clearSessionCookie();
  return NextResponse.redirect(new URL("/login", getRedirectBaseUrl(request)), { status: 303 });
}
