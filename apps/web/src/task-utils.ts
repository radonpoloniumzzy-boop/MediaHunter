import type { TaskRecord } from "./api";

export interface ParsedTaskUrls {
  urls: string[];
  invalidUrls: string[];
  duplicateCount: number;
}

function isValidWeChatArticleUrl(value: string) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && url.hostname === "mp.weixin.qq.com";
  } catch {
    return false;
  }
}

export function parseTaskUrls(input: string): ParsedTaskUrls {
  const entries = input
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const urls: string[] = [];
  const invalidUrls: string[] = [];
  let duplicateCount = 0;

  for (const entry of entries) {
    if (!isValidWeChatArticleUrl(entry)) {
      invalidUrls.push(entry);
      continue;
    }

    if (seen.has(entry)) {
      duplicateCount += 1;
      continue;
    }

    seen.add(entry);
    urls.push(entry);
  }

  return { urls, invalidUrls, duplicateCount };
}

export function getTaskTypeLabel(taskType: string) {
  return (
    {
      single_article_backfill: "文章补采（支持多篇）",
      single_account_incremental: "单账号增量采集",
      multi_account_incremental: "多账号增量采集",
      batch_incremental: "多账号增量采集",
      history_backfill: "历史文章回填",
      failed_retry: "失败项重试"
    }[taskType] ?? taskType
  );
}

export function getTaskStatusLabel(status: string) {
  return (
    {
      pending: "待处理",
      running: "运行中",
      success: "成功",
      partial_success: "部分成功",
      failed: "失败",
      paused: "已暂停",
      cancelled: "已取消"
    }[status] ?? status
  );
}

export function isTaskActive(task?: Pick<TaskRecord, "status"> | null) {
  return task?.status === "pending" || task?.status === "running";
}
