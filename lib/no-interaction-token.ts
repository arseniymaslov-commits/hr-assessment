import crypto from "crypto";

type NoInteractionPayload = {
  periodId: string;
  evaluatorDepartmentId: string;
  userId: string;
  exp: number;
};

function secret() {
  return process.env.AUTH_SECRET || "local-dev-secret-change-me";
}

function sign(data: string) {
  return crypto.createHmac("sha256", secret()).update(data).digest("base64url");
}

export function createNoInteractionToken(payload: Omit<NoInteractionPayload, "exp">, expiresAt: Date) {
  const encoded = Buffer.from(JSON.stringify({ ...payload, exp: expiresAt.getTime() })).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function readNoInteractionToken(token: string | null) {
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature || sign(encoded) !== signature) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as NoInteractionPayload;
    if (!payload.periodId || !payload.evaluatorDepartmentId || !payload.userId || payload.exp < Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
