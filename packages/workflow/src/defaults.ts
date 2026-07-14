import type { RequirementDoc } from "./types";

const DEFAULTS = {
  user_goal: "产出一篇适合传播与转化的金融深度稿。",
  target_audience: "对金融感兴趣、但时间有限的内容平台读者。",
  tone: "锋利、专业、结论先行",
  length_target: "1800-2400 字",
  time_horizon: "未来 3-6 个月",
  region_market: "中国 / A股",
  cta_goal: "引导读者转发、收藏并关注后续内容",
  freshness_requirement: "优先使用近 90 天内的材料"
};

export const DEFAULT_REQUIREMENT_FIELDS = DEFAULTS;

export function createRequirementSkeleton(requestId: string, topic = ""): RequirementDoc {
  return {
    request_id: requestId,
    topic,
    user_goal: DEFAULTS.user_goal,
    target_audience: DEFAULTS.target_audience,
    article_format: "deep_social_finance",
    tone: DEFAULTS.tone,
    length_target: DEFAULTS.length_target,
    must_cover: [],
    must_avoid: ["无依据喊单", "编造数据", "空泛鸡汤"],
    time_horizon: DEFAULTS.time_horizon,
    region_market: DEFAULTS.region_market,
    seo_keywords: [],
    cta_goal: DEFAULTS.cta_goal,
    freshness_requirement: DEFAULTS.freshness_requirement,
    completeness_score: 0,
    missing_slots: []
  };
}
