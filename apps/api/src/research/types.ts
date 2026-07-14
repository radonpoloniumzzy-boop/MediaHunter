export type RoleName = "admin" | "operator" | "researcher" | "compliance" | "viewer";

export type AccountStatus = "active" | "paused" | "blacklisted";
export type AccountPriority = "A" | "B" | "C";

export type RuleType = "keyword" | "risk" | "column";
export type RuleSeverity = "low" | "medium" | "high" | "blocked";

export type TaskType =
  | "single_account_incremental"
  | "multi_account_incremental"
  | "batch_incremental"
  | "single_article_backfill"
  | "history_backfill"
  | "failed_retry";

export type TaskStatus =
  | "pending"
  | "running"
  | "success"
  | "partial_success"
  | "failed"
  | "paused"
  | "cancelled";

export type TaskItemStatus = "pending" | "running" | "success" | "failed" | "cancelled" | "paused";

export type ReviewStatus = "unreviewed" | "reviewed" | "needs_compliance";
export type RiskLevel = "low" | "medium" | "high" | "blocked";
export type UsabilityLevel = "A" | "B" | "C" | "D";

export interface AuthUser {
  id: string;
  username: string;
  display_name: string;
  roles: RoleName[];
  status: string;
}

export interface ArticleListFilters {
  article_ids?: string[];
  keyword?: string;
  source_id?: string;
  risk_level?: RiskLevel;
  usability_level?: UsabilityLevel;
  review_status?: ReviewStatus;
  start_date?: string;
  end_date?: string;
  tag_ids?: string[];
  duplicate?: boolean;
  sort_by?: string;
  sort_order?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

export interface WeChatArticleSnapshot {
  title: string;
  author: string | null;
  publish_time: string | null;
  summary: string | null;
  cover_url: string | null;
  content_html: string;
  content_text: string;
  image_urls: string[];
  has_video: boolean;
  has_audio: boolean;
  raw_json: Record<string, unknown>;
}

export interface RuleHit {
  rule_id: string;
  rule_type: RuleType;
  severity: RuleSeverity;
  hit_text: string;
  location: "title" | "content";
  hit_count: number;
}
