import { createHash, randomUUID, timingSafeEqual } from "node:crypto";

const PASSWORD_PEPPER = "lan-ting-research-v1";

export function hashPassword(password: string): string {
  return createHash("sha256").update(`${PASSWORD_PEPPER}:${password}`).digest("hex");
}

export function verifyPassword(password: string, passwordHash: string): boolean {
  const incoming = Buffer.from(hashPassword(password));
  const stored = Buffer.from(passwordHash);

  if (incoming.length !== stored.length) {
    return false;
  }

  return timingSafeEqual(incoming, stored);
}

export function createSessionToken(): string {
  return randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
}

export function toSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
