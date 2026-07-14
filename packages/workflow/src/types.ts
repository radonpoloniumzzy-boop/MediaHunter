import { z } from "zod";

import { ResearchBundleSchema } from "@lan-ting/rag";

export const RequirementDocSchema = z.object({
  request_id: z.string(),
  topic: z.string().min(1),
  user_goal: z.string().min(1),
  target_audience: z.string().min(1),
  article_format: z.literal("deep_social_finance"),
  tone: z.string().min(1),
  length_target: z.string().min(1),
  must_cover: z.array(z.string()),
  must_avoid: z.array(z.string()),
  time_horizon: z.string().min(1),
  region_market: z.string().min(1),
  seo_keywords: z.array(z.string()),
  cta_goal: z.string().min(1),
  freshness_requirement: z.string().min(1),
  completeness_score: z.number().min(0).max(1),
  missing_slots: z.array(z.string())
});

export const DraftArticleSchema = z.object({
  headline: z.string(),
  deck: z.string(),
  body_markdown: z.string(),
  key_points: z.array(z.string()),
  citation_map: z.array(
    z.object({
      section: z.string(),
      source_ids: z.array(z.string())
    })
  ),
  fact_check_flags: z.array(z.string())
});

export const PublishableArticleSchema = z.object({
  title_candidates: z.array(z.string()),
  final_title: z.string(),
  lead_hook: z.string(),
  body_markdown: z.string(),
  quote_cards: z.array(z.string()),
  summary_card: z.string(),
  tags: z.array(z.string()),
  review_status: z.enum(["pending_review", "approved", "revision_requested", "rejected"])
});

export const WorkflowStatusSchema = z.enum([
  "collecting_requirements",
  "researching",
  "drafting",
  "polishing",
  "pending_review",
  "approved",
  "revision_requested",
  "rejected",
  "failed"
]);

export const WorkflowResultSchema = z.object({
  status: WorkflowStatusSchema,
  requirement: RequirementDocSchema,
  research: ResearchBundleSchema,
  draft: DraftArticleSchema,
  publishable: PublishableArticleSchema
});

export type RequirementDoc = z.infer<typeof RequirementDocSchema>;
export type DraftArticle = z.infer<typeof DraftArticleSchema>;
export type PublishableArticle = z.infer<typeof PublishableArticleSchema>;
export type WorkflowStatus = z.infer<typeof WorkflowStatusSchema>;
export type WorkflowResult = z.infer<typeof WorkflowResultSchema>;

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  created_at?: string;
}

export interface RequirementProgress {
  ready: boolean;
  assistantMessage: string;
  requirementDoc: RequirementDoc;
}

export interface WorkflowRuntimeOptions {
  openAIApiKey?: string;
  openAIModel?: string;
  openAIBaseUrl?: string;
}

