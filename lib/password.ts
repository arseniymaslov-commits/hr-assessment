import crypto from "crypto";

export function hashPassword(password: string) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

export function verifyPassword(password: string, passwordHash: string) {
  return hashPassword(password) === passwordHash;
}
