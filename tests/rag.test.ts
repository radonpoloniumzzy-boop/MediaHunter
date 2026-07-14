import { describe, expect, it } from "vitest";

import { retrieveResearchBundle } from "../packages/rag/src/retriever";

describe("RAG retriever", () => {
  it("returns source metadata and citations", () => {
    const bundle = retrieveResearchBundle({
      topic: "A-share AI infrastructure",
      target_audience: "Public-account readers",
      region_market: "China / A-share",
      seo_keywords: ["AI", "infrastructure"],
      must_cover: [],
      freshness_requirement: "Prefer material from the last 30 days"
    });

    expect(bundle.sources.length).toBeGreaterThan(0);
    expect(bundle.citations[0]?.source_id).toBeTruthy();
    expect(bundle.query_plan[0]).toContain("Topic decomposition");
  });
});
