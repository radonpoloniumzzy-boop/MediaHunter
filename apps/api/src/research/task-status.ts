import type { TaskStatus } from "./types";

export interface TaskStatusSummary {
  total_count?: number | string | null;
  success_count?: number | string | null;
  failed_count?: number | string | null;
  running_count?: number | string | null;
  pending_count?: number | string | null;
  paused_count?: number | string | null;
  cancelled_count?: number | string | null;
}

function asCount(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

export function deriveTaskStatus(summary: TaskStatusSummary, fallback: TaskStatus = "pending"): TaskStatus {
  const total = asCount(summary.total_count);
  const success = asCount(summary.success_count);
  const failed = asCount(summary.failed_count);
  const running = asCount(summary.running_count);
  const pending = asCount(summary.pending_count);
  const paused = asCount(summary.paused_count);
  const cancelled = asCount(summary.cancelled_count);
  const completed = success + failed + cancelled;

  if (running > 0) return "running";
  if (success === total && total > 0) return "success";
  if (failed === total && total > 0) return "failed";
  if (cancelled === total && total > 0) return "cancelled";
  if (completed === total && success > 0 && (failed > 0 || cancelled > 0)) return "partial_success";
  if (paused > 0 && pending === 0 && running === 0 && completed < total) return "paused";
  if (paused > 0 && pending > 0 && running === 0 && completed === 0) return "paused";
  if (pending > 0) return "pending";
  if (completed === total && total > 0) return success > 0 ? "partial_success" : fallback;
  return fallback;
}
