import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "../apps/api/src/research/auth-utils";

describe("research auth utils", () => {
  it("hashes and verifies passwords consistently", () => {
    const password = "Changeme123!";
    const hashed = hashPassword(password);

    expect(hashed).not.toBe(password);
    expect(verifyPassword(password, hashed)).toBe(true);
    expect(verifyPassword("wrong-password", hashed)).toBe(false);
  });
});
