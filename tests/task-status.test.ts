import { describe, expect, it } from "vitest";

import { deriveTaskStatus } from "../apps/api/src/research/task-status";

describe("task status derivation", () => {
  it("shows success when all items already completed even if stored task status is stale", () => {
    expect(
      deriveTaskStatus({
        total_count: 3,
        success_count: 3,
        failed_count: 0,
        cancelled_count: 0,
        running_count: 0,
        pending_count: 0,
        paused_count: 0
      })
    ).toBe("success");
  });

  it("shows paused when work is halted and unfinished", () => {
    expect(
      deriveTaskStatus({
        total_count: 3,
        success_count: 0,
        failed_count: 0,
        cancelled_count: 0,
        running_count: 0,
        pending_count: 0,
        paused_count: 3
      })
    ).toBe("paused");
  });
});
