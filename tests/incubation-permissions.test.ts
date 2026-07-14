import { describe, expect, it } from "vitest";

import { hasPermission } from "../apps/api/src/research/permissions";

describe("incubation permissions", () => {
  it("allows operators to manage and export stage-1 incubation data", () => {
    expect(hasPermission(["operator"], "incubation:read")).toBe(true);
    expect(hasPermission(["operator"], "incubation:write")).toBe(true);
    expect(hasPermission(["operator"], "incubation:export")).toBe(true);
  });

  it("keeps viewers read-only for incubation routes", () => {
    expect(hasPermission(["viewer"], "incubation:read")).toBe(true);
    expect(hasPermission(["viewer"], "incubation:write")).toBe(false);
    expect(hasPermission(["viewer"], "incubation:export")).toBe(false);
  });
});

