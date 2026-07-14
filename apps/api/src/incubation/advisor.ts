import type { ContentMetrics, TopicSeed, TrackScoreInputs, TrackScoreSuggestion, ViralSignals } from "./types";

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeDifficulty(value?: string | null) {
  const normalized = String(value ?? "").toLowerCase();
  if (["low", "easy", "低", "容易"].some((item) => normalized.includes(item))) return 85;
  if (["high", "hard", "高", "困难"].some((item) => normalized.includes(item))) return 45;
  return 65;
}

function normalizeRisk(value?: string | null) {
  const normalized = String(value ?? "").toLowerCase();
  if (["blocked", "禁", "high", "高"].some((item) => normalized.includes(item))) return 35;
  if (["low", "低"].some((item) => normalized.includes(item))) return 90;
  return 70;
}

export function buildTrackScoreSuggestion(input: TrackScoreInputs): TrackScoreSuggestion {
  const market = clampScore(
    Math.min(input.contentCount, 1000) / 10 +
      Math.min(input.viralContentCount, 80) * 1.1 +
      Math.min(input.commentCount, 5000) / 100
  );
  const monetization = clampScore((input.commercialPathPresent ? 72 : 42) + Math.min(input.benchmarkCount, 20));
  const supply = clampScore(normalizeDifficulty(input.contentSupplyDifficulty));
  const benchmark = clampScore(Math.min(input.benchmarkCount, 50) * 1.4 + Math.min(input.lowFollowerViralCount, 40) * 1.2);
  const platformFit = clampScore(45 + Math.min(input.keywordCount, 20) * 2 + Math.min(input.viralContentCount, 30));
  const compliance = clampScore(normalizeRisk(input.complianceRiskLevel));

  const total = clampScore(market * 0.25 + monetization * 0.2 + supply * 0.2 + benchmark * 0.15 + platformFit * 0.1 + compliance * 0.1);
  const reasons = [
    `市场需求参考 ${input.contentCount} 条内容、${input.viralContentCount} 条爆款、${input.commentCount} 条评论。`,
    `对标参考 ${input.benchmarkCount} 个账号，其中低粉爆款样本 ${input.lowFollowerViralCount} 条。`,
    input.commercialPathPresent ? "已记录变现路径，可进入小规模验证。" : "暂未记录变现路径，建议补充商业闭环证据。",
    `合规风险按 ${input.complianceRiskLevel ?? "medium"} 处理，AI 只给建议不直接发布。`
  ];

  return {
    market_demand_score: market,
    monetization_score: monetization,
    content_supply_score: supply,
    benchmark_copy_score: benchmark,
    platform_fit_score: platformFit,
    compliance_risk_score: compliance,
    total_score: total,
    reasons
  };
}

export function classifyViralContent(metrics: ContentMetrics): ViralSignals {
  const likes = Number(metrics.likes ?? 0);
  const collects = Number(metrics.collects ?? 0);
  const comments = Number(metrics.comments ?? 0);
  const shares = Number(metrics.shares ?? 0);
  const plays = Number(metrics.plays ?? 0);
  const followers = Number(metrics.follower_count ?? 0);
  const interactions = likes + collects * 1.4 + comments * 2 + shares * 2.2;
  const denominator = plays > 0 ? plays : Math.max(followers, 1);
  const interactionRate = Number((interactions / denominator).toFixed(6));
  const lowFollower = followers > 0 && followers <= 10000;
  const isLowFollowerViral = lowFollower && (interactions >= 300 || interactionRate >= 0.08);
  const isViral = interactions >= 1000 || interactionRate >= 0.12 || isLowFollowerViral;
  const reasons = [
    `互动量 ${Math.round(interactions)}，互动率 ${interactionRate}`,
    isLowFollowerViral ? "低粉账号出现高互动，适合进入对标拆解。" : "未触发低粉爆款规则。",
    isViral ? "达到爆款样本阈值。" : "未达到爆款样本阈值。"
  ];

  return {
    interaction_rate: interactionRate,
    is_low_follower_viral: isLowFollowerViral,
    is_viral: isViral,
    reasons
  };
}

export function classifyCommentNeed(commentText: string) {
  const text = commentText.trim();
  const lower = text.toLowerCase();
  const rules: Array<[string, string[]]> = [
    ["求教程", ["怎么", "如何", "教程", "步骤", "新手", "流程"]],
    ["求推荐", ["推荐", "哪个好", "哪款", "有没有"]],
    ["求价格", ["价格", "多少钱", "费用", "预算", "报价"]],
    ["求链接", ["链接", "地址", "哪里买", "入口"]],
    ["质疑", ["真的假的", "靠谱吗", "不信", "割韭菜", "有用吗"]],
    ["购买意向", ["想买", "下单", "怎么买", "私信", "咨询"]]
  ];

  const matched = rules.find(([, keywords]) => keywords.some((keyword) => lower.includes(keyword) || text.includes(keyword)));
  const needType = matched?.[0] ?? "共鸣";
  const sentiment = needType === "质疑" ? "negative" : needType === "共鸣" ? "neutral" : "positive";
  const intentScore = needType === "购买意向" ? 90 : ["求价格", "求链接"].includes(needType) ? 75 : needType === "求教程" ? 62 : 45;
  const clusterKey = `${needType}:${text.slice(0, 18)}`;

  return {
    need_type: needType,
    sentiment,
    intent_score: intentScore,
    cluster_key: clusterKey,
    can_convert_topic: needType !== "质疑",
    can_convert_faq: ["求教程", "求价格", "质疑"].includes(needType),
    can_convert_script: ["求教程", "购买意向", "共鸣"].includes(needType)
  };
}

function compactTitle(value: unknown, fallback: string) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > 42 ? `${text.slice(0, 42)}...` : text || fallback;
}

export function buildTopicSeeds(input: {
  contentSamples: Array<Record<string, unknown>>;
  comments: Array<Record<string, unknown>>;
  sources: Array<Record<string, unknown>>;
  limit?: number;
}): TopicSeed[] {
  const limit = Math.max(1, Math.min(input.limit ?? 12, 30));
  const seeds: TopicSeed[] = [];

  for (const sample of input.contentSamples) {
    if (seeds.length >= limit) break;
    const title = compactTitle(sample.title, "爆款内容");
    seeds.push({
      title: `复刻拆解：${title}的可迁移表达`,
      track_id: typeof sample.track_id === "string" ? sample.track_id : null,
      platform_targets: [],
      pain_point: typeof sample.comment_need_summary === "string" ? sample.comment_need_summary : null,
      topic_type: "viral_remix",
      priority: sample.is_low_follower_viral ? "A" : "B",
      risk_level: String(sample.risk_level ?? "medium") === "high" ? "high" : "medium",
      source_trace: { content_sample_id: sample.id, source: "content_sample" },
      suggestion_reason: "来自爆款内容库，适合拆解标题、钩子和评论需求后生成平台版本。",
      content_sample_id: typeof sample.id === "string" ? sample.id : null
    });
  }

  for (const comment of input.comments) {
    if (seeds.length >= limit) break;
    const text = compactTitle(comment.comment_text, "评论需求");
    seeds.push({
      title: `评论追问选题：${text}`,
      track_id: typeof comment.track_id === "string" ? comment.track_id : null,
      platform_targets: [],
      pain_point: typeof comment.comment_text === "string" ? comment.comment_text : null,
      topic_type: "comment_need",
      priority: Number(comment.intent_score ?? 0) >= 75 ? "A" : "B",
      risk_level: String(comment.need_type ?? "") === "质疑" ? "medium" : "low",
      source_trace: { comment_need_id: comment.id, need_type: comment.need_type, source: "comment_need" },
      suggestion_reason: "来自评论需求库，优先覆盖用户明确追问和购买前疑问。",
      comment_need_id: typeof comment.id === "string" ? comment.id : null
    });
  }

  for (const source of input.sources) {
    if (seeds.length >= limit) break;
    const name = compactTitle(source.name, "热点来源");
    seeds.push({
      title: `热点响应：${name}对赛道的切入角度`,
      track_id: typeof source.track_id === "string" ? source.track_id : null,
      platform_targets: [],
      pain_point: null,
      topic_type: "hot_response",
      priority: String(source.importance ?? "B") === "A" ? "A" : "B",
      risk_level: "medium",
      source_trace: { information_source_id: source.id, source: "information_source" },
      suggestion_reason: "来自信息源/热点雷达，适合生成低风险热点响应任务。",
      hot_source_id: typeof source.id === "string" ? source.id : null
    });
  }

  return seeds;
}

