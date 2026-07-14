import { describe, expect, it } from "vitest";

import { deriveTaskProgress } from "../apps/api/src/research/task-progress";

describe("task progress aggregation", () => {
  it("derives completed counts and percent including cancelled items", () => {
    expect(
      deriveTaskProgress({
        success_count: 2,
        failed_count: 1,
        cancelled_count: 1,
        running_count: 1,
        pending_count: 1,
        paused_count: 0,
        total_count: 6
      })
    ).toEqual({
      success_count: 2,
      failed_count: 1,
      running_count: 1,
      pending_count: 1,
      paused_count: 0,
      cancelled_count: 1,
      total_count: 6,
      completed_count: 4,
      progress_percent: 67
    });
  });

  it("falls back to zero percent when a task has no items yet", () => {
    expect(
      deriveTaskProgress({
        success_count: 0,
        failed_count: 0,
        cancelled_count: 0,
        running_count: 0,
        pending_count: 0,
        paused_count: 0,
        total_count: 0
      }).progress_percent
    ).toBe(0);
  });
});
