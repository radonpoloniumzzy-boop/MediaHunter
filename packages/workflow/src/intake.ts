import { REQUIRED_REQUIREMENT_SLOTS } from "@lan-ting/prompts";

import { createRequirementSkeleton, DEFAULT_REQUIREMENT_FIELDS } from "./defaults";
import { RequirementDocSchema, type ConversationMessage, type RequirementDoc, type RequirementProgress } from "./types";

function containsAny(text: string, patterns: string[]): boolean {
  const lowered = text.toLowerCase();
  return patterns.some((pattern) => lowered.includes(pattern.toLowerCase()));
}

function latestUserText(messages: ConversationMessage[]): string {
  const latest = [...messages].reverse().find((message) => message.role === "user");
  return latest?.content.trim() ?? "";
}

function fullUserText(messages: ConversationMessage[]): string {
  return messages
    .filter((message) => message.role === "user")
    .map((message) => message.content)
    .join("\n");
}

function inferTone(text: string): string | null {
  if (containsAny(text, ["sharp", "edgy", "spicy", "critical", "犀利", "毒舌"])) return "锋利、直戳痛点";
  if (containsAny(text, ["simple", "plain", "easy", "beginner", "intro", "通俗", "小白"])) return "通俗、克制、对新手友好";
  if (containsAny(text, ["professional", "research", "hardcore", "institutional", "专业", "投研", "硬核"])) return "专业、密度高、结论先行";
  return null;
}

function inferLength(text: string): string | null {
  const explicit = text.match(/(\d{3,4})\s*(words?|chars?|字)?/i);
  if (explicit) return `${explicit[1]} 字`;
  if (containsAny(text, ["long-form", "deep", "deep dive", "长文", "深度"])) return "1800-2400 字";
  if (containsAny(text, ["short", "brief", "quick take", "短评", "快讯"])) return "800-1200 字";
  return null;
}

function inferAudience(text: string): string | null {
  if (containsAny(text, ["retail", "beginner", "newbie", "散户", "入门"])) return "普通投资者与泛财经读者";
  if (containsAny(text, ["founder", "owner", "high net worth", "老板", "企业主"])) return "企业主与高净值读者";
  if (containsAny(text, ["institutional", "analyst", "research", "机构", "分析师", "投研"])) return "机构投研读者";
  if (containsAny(text, ["public account", "newsletter", "new media", "social", "公众号", "新媒体"])) return "公众号与泛财经内容读者";
  return null;
}

function inferGoal(text: string): string | null {
  if (containsAny(text, ["conversion", "lead", "deal", "private traffic", "转化", "私域"])) return "借内容完成转化，并建立专业信任";
  if (containsAny(text, ["growth", "viral", "share", "followers", "涨粉", "传播", "转发"])) return "提高传播率、收藏率和账号增长";
  if (containsAny(text, ["explain", "clarify", "education", "解释", "讲清", "科普"])) return "把复杂金融问题讲清楚";
  return null;
}

function inferRegion(text: string): string | null {
  if (containsAny(text, ["hong kong", "hk equity", "hang seng", "港股", "香港"])) return "香港 / 港股";
  if (containsAny(text, ["united states", "us equity", "nasdaq", "nyse", "u.s.", "美股", "美国"])) return "美国 / 美股";
  if (containsAny(text, ["global", "overseas", "international", "全球", "海外"])) return "全球市场";
  if (containsAny(text, ["a-share", "ashare", "china", "shanghai", "shenzhen", "a股", "中国", "沪深"])) return "中国 / A股";
  return null;
}

function inferTimeHorizon(text: string): string | null {
  if (containsAny(text, ["today", "this week", "short term", "near term", "近期", "短期", "本周"])) return "未来 1-4 周";
  if (containsAny(text, ["quarter", "this year", "within the year", "季度", "年内", "今年"])) return "未来 1-3 个季度";
  if (containsAny(text, ["next year", "mid term", "long term", "three years", "明年", "中长期", "三年"])) return "未来 1-3 年";
  return null;
}

function inferFreshness(text: string): string {
  if (containsAny(text, ["live", "latest", "recent", "hot", "breaking", "最新", "热点", "近期"])) {
    return "优先使用近 30 天内的材料";
  }
  return DEFAULT_REQUIREMENT_FIELDS.freshness_requirement;
}

function inferList(text: string, triggers: string[]): string[] {
  const lowered = text.toLowerCase();
  const trigger = triggers.find((item) => lowered.includes(item.toLowerCase()));
  if (!trigger) return [];

  const index = lowered.indexOf(trigger.toLowerCase());
  const snippet = text
    .slice(index + trigger.length)
    .split("\n")[0]
    ?.replace(/^[:\s-]+/, "") ?? "";

  return snippet
    .split(/[;,/|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function extractSeoKeywords(topic: string, text: string): string[] {
  const fromQuoted = [...text.matchAll(/"([^"]+)"/g)].map((match) => match[1].trim());
  const base = [topic, ...fromQuoted, ...inferList(text, ["keywords", "seo", "tags"])];
  return [...new Set(base.filter(Boolean))].slice(0, 6);
}

function extractTopic(text: string): string {
  const direct = text.match(/(?:write|analyze|cover|about)\s+(.+?)(?:[\n,.!?]|$)/i);
  if (direct?.[1]) return direct[1].trim();
  return text.split(/[.!?\n]/)[0]?.trim() ?? "";
}

function computeMissingSlots(doc: RequirementDoc): string[] {
  return REQUIRED_REQUIREMENT_SLOTS.filter((slot) => {
    const value = doc[slot];
    return typeof value === "string" ? value.trim().length === 0 : false;
  });
}

export function buildRequirementDoc(requestId: string, messages: ConversationMessage[]): RequirementDoc {
  const text = fullUserText(messages);
  const latest = latestUserText(messages);
  const topic = extractTopic(latest || text);
  const base = createRequirementSkeleton(requestId, topic);
  const mustCover = inferList(text, ["must cover", "focus on", "include"]);
  const mustAvoid = inferList(text, ["avoid", "exclude", "skip"]);
  const inferred = {
    topic,
    user_goal: inferGoal(text),
    target_audience: inferAudience(text),
    tone: inferTone(text),
    length_target: inferLength(text),
    time_horizon: inferTimeHorizon(text),
    region_market: inferRegion(text)
  };
  const missingSlots = REQUIRED_REQUIREMENT_SLOTS.filter((slot) => {
    const value = inferred[slot];
    return !value || value.trim().length === 0;
  });

  const doc: RequirementDoc = {
    ...base,
    topic: inferred.topic || base.topic,
    user_goal: inferred.user_goal ?? base.user_goal,
    target_audience: inferred.target_audience ?? base.target_audience,
    tone: inferred.tone ?? base.tone,
    length_target: inferred.length_target ?? base.length_target,
    must_cover: mustCover,
    must_avoid: mustAvoid.length > 0 ? mustAvoid : base.must_avoid,
    time_horizon: inferred.time_horizon ?? base.time_horizon,
    region_market: inferred.region_market ?? base.region_market,
    seo_keywords: extractSeoKeywords(topic, text),
    cta_goal: /follow|subscribe|share|save|关注|订阅|转发|收藏/i.test(text) ? "引导读者关注、转发、收藏" : base.cta_goal,
    freshness_requirement: inferFreshness(text),
    completeness_score: 0,
    missing_slots: []
  };

  const userTurns = messages.filter((message) => message.role === "user").length;
  const userAcceptedDefaults = /whatever|you decide|default|your call|随便|你定|默认/i.test(text);

  if (missingSlots.length > 0 && (userTurns >= 2 || userAcceptedDefaults)) {
    const filled = { ...doc };
    missingSlots.forEach((slot) => {
      const value = DEFAULT_REQUIREMENT_FIELDS[slot as keyof typeof DEFAULT_REQUIREMENT_FIELDS];
      if (typeof value === "string") {
        (filled as Record<string, unknown>)[slot] = value;
      }
    });
    filled.missing_slots = missingSlots;
    filled.completeness_score = 1 - missingSlots.length / REQUIRED_REQUIREMENT_SLOTS.length;
    return RequirementDocSchema.parse(filled);
  }

  doc.missing_slots = missingSlots;
  doc.completeness_score = 1 - missingSlots.length / REQUIRED_REQUIREMENT_SLOTS.length;
  return RequirementDocSchema.parse(doc);
}

export function createRequirementProgress(requestId: string, messages: ConversationMessage[]): RequirementProgress {
  const requirementDoc = buildRequirementDoc(requestId, messages);
  const ready = requirementDoc.missing_slots.length === 0 || messages.filter((message) => message.role === "user").length >= 2;

  const assistantMessage = ready
    ? `需求已锁定：
- 主题：${requirementDoc.topic}
- 受众：${requirementDoc.target_audience}
- 目标：${requirementDoc.user_goal}
- 市场：${requirementDoc.region_market}

现在把单子转给钟孚和虞玄姬继续生产。`
    : `还缺这些关键槽位：${requirementDoc.missing_slots.join("、")}。
请按“受众 / 目标 / 篇幅 / 市场范围”这种格式补一句。`;

  return {
    ready,
    assistantMessage,
    requirementDoc
  };
}
