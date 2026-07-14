export interface TaskProgressInput {
  success_count?: number | string | null;
  failed_count?: number | string | null;
  running_count?: number | string | null;
  pending_count?: number | string | null;
  paused_count?: number | string | null;
  cancelled_count?: number | string | null;
  total_count?: number | string | null;
}

function asCount(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

export function deriveTaskProgress(input: TaskProgressInput) {
  const success_count = asCount(input.success_count);
  const failed_count = asCount(input.failed_count);
  const running_count = asCount(input.running_count);
  const pending_count = asCount(input.pending_count);
  const paused_count = asCount(input.paused_count);
  const cancelled_count = asCount(input.cancelled_count);
  const total_count = asCount(input.total_count);
  const completed_count = success_count + failed_count + cancelled_count;
  const progress_percent = total_count > 0 ? Math.round((completed_count / total_count) * 100) : 0;

  return {
    success_count,
    failed_count,
    running_count,
    pending_count,
    paused_count,
    cancelled_count,
    total_count,
    completed_count,
    progress_percent
  };
}
