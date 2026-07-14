import { describe, expect, it } from "vitest";

import { runWorkflow } from "../packages/workflow/src/graph";
import { RequirementDocSchema } from "../packages/workflow/src/types";

describe("Workflow pipeline", () => {
  it("produces a publishable article with pending review status", async () => {
    const requirement = RequirementDocSchema.parse({
      request_id: "req-3",
      topic: "A-share dividends and bank valuation repair",
      user_goal: "Produce a finance article suitable for social distribution",
      target_audience: "General finance readers",
      article_format: "deep_social_finance",
      tone: "Professional, sharp, conclusion-first",
      length_target: "1800-2400 words",
      must_cover: ["dividend logic", "net interest margin"],
      must_avoid: ["stock touting"],
      time_horizon: "Next 1-2 quarters",
      region_market: "Hong Kong / HK equities",
      seo_keywords: ["bank stocks", "high dividend"],
      cta_goal: "Increase shares and saves",
      freshness_requirement: "Prefer material from the last 90 days",
      completeness_score: 1,
      missing_slots: []
    });

    const result = await runWorkflow(requirement, {});

    expect(result.status).toBe("pending_review");
    expect(result.research.sources.length).toBeGreaterThan(0);
    expect(result.publishable.review_status).toBe("pending_review");
  });
});
