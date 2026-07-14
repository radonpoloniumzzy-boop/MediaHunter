import { describe, expect, it } from "vitest";

import { buildTopicSeeds, buildTrackScoreSuggestion, classifyCommentNeed, classifyViralContent } from "../apps/api/src/incubation/advisor";

describe("incubation local advisor", () => {
  it("scores tracks with the documented stage-1 weights", () => {
    const score = buildTrackScoreSuggestion({
      keywordCount: 8,
      contentCount: 300,
      viralContentCount: 28,
      lowFollowerViralCount: 6,
      benchmarkCount: 12,
      commentCount: 900,
      commercialPathPresent: true,
      contentSupplyDifficulty: "low",
      complianceRiskLevel: "low"
    });

    expect(score.market_demand_score).toBeGreaterThan(60);
    expect(score.monetization_score).toBeGreaterThan(70);
    expect(score.compliance_risk_score).toBe(90);
    expect(score.total_score).toBeGreaterThan(70);
    expect(score.reasons.join("\n")).toContain("市场需求");
  });

  it("marks low-follower high-interaction samples as viral", () => {
    const signals = classifyViralContent({
      likes: 280,
      collects: 90,
      comments: 45,
      shares: 20,
      plays: 2800,
      follower_count: 3200
    });

    expect(signals.is_viral).toBe(true);
    expect(signals.is_low_follower_viral).toBe(true);
    expect(signals.interaction_rate).toBeGreaterThan(0.1);
  });

  it("clusters comments into actionable need types", () => {
    const need = classifyCommentNeed("新手怎么做？有没有完整教程和步骤");

    expect(need.need_type).toBe("求教程");
    expect(need.can_convert_topic).toBe(true);
    expect(need.can_convert_faq).toBe(true);
    expect(need.intent_score).toBeGreaterThan(50);
  });

  it("builds topic seeds from viral content, comments, and sources", () => {
    const seeds = buildTopicSeeds({
      contentSamples: [{ id: "content-1", title: "低粉账号如何靠封面钩子爆量", is_low_follower_viral: true, risk_level: "medium" }],
      comments: [{ id: "comment-1", comment_text: "价格多少，怎么买", need_type: "求价格", intent_score: 80 }],
      sources: [{ id: "source-1", name: "平台规则更新", importance: "A" }],
      limit: 3
    });

    expect(seeds).toHaveLength(3);
    expect(seeds[0].topic_type).toBe("viral_remix");
    expect(seeds[1].topic_type).toBe("comment_need");
    expect(seeds[2].topic_type).toBe("hot_response");
    expect(seeds[0].priority).toBe("A");
  });
});

