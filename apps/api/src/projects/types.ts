export interface ProjectBrief {
  business_context: string;
  change_event: string | null;
  target_audience: string | null;
  communication_goal: string | null;
  constraints: string[];
  deliverables: string[];
}

export interface BriefQuestion {
  key: "change_event" | "target_audience" | "communication_goal";
  prompt: string;
  reason: string;
}
