export type IncubationEntity =
  | "platforms"
  | "tracks"
  | "keywords"
  | "information-sources"
  | "tasks"
  | "benchmark-accounts"
  | "content-samples"
  | "comments"
  | "topics"
  | "owned-accounts"
  | "materials";

export type ExportFormat = "csv" | "xlsx";

export interface TrackScoreInputs {
  keywordCount: number;
  contentCount: number;
  viralContentCount: number;
  lowFollowerViralCount: number;
  benchmarkCount: number;
  commentCount: number;
  commercialPathPresent: boolean;
  contentSupplyDifficulty?: string | null;
  complianceRiskLevel?: string | null;
}

export interface TrackScoreSuggestion {
  market_demand_score: number;
  monetization_score: number;
  content_supply_score: number;
  benchmark_copy_score: number;
  platform_fit_score: number;
  compliance_risk_score: number;
  total_score: number;
  reasons: string[];
}

export interface ContentMetrics {
  likes?: number | null;
  collects?: number | null;
  comments?: number | null;
  shares?: number | null;
  plays?: number | null;
  follower_count?: number | null;
}

export interface ViralSignals {
  interaction_rate: number;
  is_low_follower_viral: boolean;
  is_viral: boolean;
  reasons: string[];
}

export interface TopicSeed {
  title: string;
  track_id?: string | null;
  platform_targets: string[];
  pain_point?: string | null;
  topic_type: "viral_remix" | "comment_need" | "hot_response";
  priority: "A" | "B" | "C";
  risk_level: "low" | "medium" | "high";
  source_trace: Record<string, unknown>;
  suggestion_reason: string;
  content_sample_id?: string | null;
  comment_need_id?: string | null;
  hot_source_id?: string | null;
}
