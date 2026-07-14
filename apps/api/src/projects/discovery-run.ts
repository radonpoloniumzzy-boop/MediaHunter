export function getDiscoveryRunStatus(succeededCount: number, failedCount: number) {
  if (failedCount === 0) return "completed" as const;
  if (succeededCount === 0) return "failed" as const;
  return "partial" as const;
}
