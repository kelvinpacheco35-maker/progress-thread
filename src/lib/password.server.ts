// Server-only password hashing helpers. Not safe to import from client code.
import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
  return { salt, hash };
}

export function verifyPassword(password: string, salt: string, expected: string) {
  const actual = pbkdf2Sync(password, salt, 120000, 32, "sha256");
  const exp = Buffer.from(expected, "hex");
  if (actual.length !== exp.length) return false;
  return timingSafeEqual(actual, exp);
}
