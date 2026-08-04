import crypto from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const COOKIE_NAME = "interaction_session";

type SessionPayload = {
  userId: string;
  exp: number;
};

function getSecret() {
  return process.env.AUTH_SECRET || "local-dev-secret-change-me";
}

function base64Url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

function sign(data: string) {
  return crypto.createHmac("sha256", getSecret()).update(data).digest("base64url");
}

export function createSessionToken(userId: string) {
  const payload: SessionPayload = {
    userId,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 14
  };
  const encoded = base64Url(JSON.stringify(payload));
  return `${encoded}.${sign(encoded)}`;
}

export function readSessionToken(token?: string): SessionPayload | null {
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature || sign(encoded) !== signature) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SessionPayload;
    if (!payload.userId || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function setSessionCookie(userId: string) {
  cookies().set(COOKIE_NAME, createSessionToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14
  });
}

export function clearSessionCookie() {
  cookies().delete(COOKIE_NAME);
}

export async function getCurrentUser() {
  const payload = readSessionToken(cookies().get(COOKIE_NAME)?.value);
  if (!payload) return null;

  return prisma.user.findUnique({
    where: { id: payload.userId },
    include: {
      department: true,
      directorDepartments: {
        include: {
          department: true
        }
      }
    }
  });
}

export async function requireUser(roles?: Role[]) {
  const user = await getCurrentUser();
  if (!user || !user.isActive) redirect("/login");
  if (roles && !roles.includes(user.role)) redirect("/dashboard");
  return user;
}

export function roleLabel(role: Role) {
  return {
    ADMIN: "Администратор",
    ANALYST: "Аналитик",
    LEADER: "Руководитель / заместитель",
    DASHBOARD_VIEWER: "Только дашборд",
    DIRECTOR: "Директор",
    VIEWER: "Просмотр"
  }[role];
}

export function canEvaluate(role: Role) {
  return role === Role.ADMIN || role === Role.LEADER || role === Role.DIRECTOR;
}

export function defaultPathForRole(role: Role) {
  return role === Role.LEADER ? "/evaluations" : "/dashboard";
}

export function canViewAnalytics(role: Role) {
  return (
    role === Role.ADMIN ||
    role === Role.ANALYST ||
    role === Role.LEADER ||
    role === Role.DIRECTOR ||
    role === Role.VIEWER ||
    role === Role.DASHBOARD_VIEWER
  );
}
