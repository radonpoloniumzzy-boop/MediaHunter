import { ChatOpenAI } from "@langchain/openai";

import { buildDraftPrompt, buildPolishPrompt } from "@lan-ting/prompts";
import type { ResearchBundle } from "@lan-ting/rag";

import { DraftArticleSchema, PublishableArticleSchema, type DraftArticle, type PublishableArticle, type RequirementDoc, type WorkflowRuntimeOptions } from "./types";

function requirementSummary(requirement: RequirementDoc): string {
  return JSON.stringify(requirement, null, 2);
}

function researchSummary(research: ResearchBundle): string {
  return JSON.stringify(research, null, 2);
}

function createModel(runtime: WorkflowRuntimeOptions): ChatOpenAI | null {
  if (!runtime.openAIApiKey) return null;

  return new ChatOpenAI({
    apiKey: runtime.openAIApiKey,
    model: runtime.openAIModel || undefined,
    configuration: runtime.openAIBaseUrl
      ? {
          baseURL: runtime.openAIBaseUrl
        }
      : undefined
  });
}

function buildFallbackDraft(requirement: RequirementDoc, research: ResearchBundle): DraftArticle {
  const leadSources = research.sources.slice(0, 3);
  const bodySections = [
    `## 先说结论\n${requirement.topic} 在 ${requirement.time_horizon} 内最值得盯住的，不是表面噪音，而是 ${leadSources
      .map((source) => source.title)
      .join("、")} 所共同指向的政策与资金拐点。`,
    `## 为什么现在要看它\n${leadSources
      .map((source) => `- ${source.title}：${source.excerpt}`)
      .join("\n")}`,
    `## 对读者真正有用的判断\n1. ${requirement.target_audience} 最该盯住的是先变的变量，而不是先吵起来的标题。\n2. 如果证据只支持趋势判断，就不能把推演写成确定性结论。\n3. 一篇文章真正有价值，在于告诉读者下一步看什么、怎么验证。`,
    `## 风险与验证\n${research.coverage_gaps.length > 0 ? research.coverage_gaps.map((gap) => `- ${gap}`).join("\n") : "- 继续跟踪后续公告、资金流和政策节奏是否验证当前判断。"}`
  ].join("\n\n");

  return DraftArticleSchema.parse({
    headline: `${requirement.topic}：真正决定成败的不是故事，而是证据`,
    deck: `一篇面向 ${requirement.target_audience} 的金融深度稿，围绕政策、资金流和预期差展开拆解。`,
    body_markdown: bodySections,
    key_points: [
      `${requirement.topic} 的主判断必须以证据为中心，而不是以情绪为中心`,
      `先解释变量，再解释资产映射，最后交代风险边界`,
      `核心结论必须绑定白名单信源`
    ],
    citation_map: [
      {
        section: "先说结论",
        source_ids: leadSources.map((source) => source.source_id)
      },
      {
        section: "为什么现在要看它",
        source_ids: research.sources.map((source) => source.source_id)
      }
    ],
    fact_check_flags: research.coverage_gaps
  });
}

function buildFallbackPublishable(requirement: RequirementDoc, draft: DraftArticle): PublishableArticle {
  const titleCandidates = [
    `别再盯噪音了，${requirement.topic} 真正的胜负手在这里`,
    `如果 ${requirement.topic} 要变盘，这 3 个信号会先说话`,
    `大多数人都把 ${requirement.topic} 看浅了，真正值钱的是这条暗线`
  ];

  return PublishableArticleSchema.parse({
    title_candidates: titleCandidates,
    final_title: titleCandidates[0],
    lead_hook: `大家都在聊 ${requirement.topic}，但真正决定结果的变量，通常不在热搜里，而在数据、公告和时间差里。`,
    body_markdown: `${draft.deck}\n\n${draft.body_markdown}\n\n## 最后一句\n如果你只记住一个判断，那就记住：先盯证据，再谈赔率。`,
    quote_cards: [
      `先盯证据，再谈赔率。`,
      `${requirement.topic} 真正关键的，不是故事有多热，而是兑现路径有多短。`,
      `包装可以放大钩子，但不能替事实造腿。`
    ],
    summary_card: `一篇围绕 ${requirement.topic} 的金融深度稿，拆解关键信号、资产映射与风险边界。`,
    tags: [...new Set(["金融深度", "流量包装", ...requirement.seo_keywords].filter(Boolean))],
    review_status: "pending_review"
  });
}

export async function generateDraftArticle(
  requirement: RequirementDoc,
  research: ResearchBundle,
  runtime: WorkflowRuntimeOptions
): Promise<DraftArticle> {
  const model = createModel(runtime);
  if (!model) return buildFallbackDraft(requirement, research);

  try {
    const prompt = buildDraftPrompt({
      requirementSummary: requirementSummary(requirement),
      researchSummary: researchSummary(research)
    });
    const structured = model.withStructuredOutput(DraftArticleSchema);
    return await structured.invoke(prompt);
  } catch {
    return buildFallbackDraft(requirement, research);
  }
}

export async function polishArticle(
  requirement: RequirementDoc,
  research: ResearchBundle,
  draft: DraftArticle,
  runtime: WorkflowRuntimeOptions
): Promise<PublishableArticle> {
  const model = createModel(runtime);
  if (!model) return buildFallbackPublishable(requirement, draft);

  try {
    const prompt = buildPolishPrompt({
      requirementSummary: requirementSummary(requirement),
      draftSummary: JSON.stringify({ research, draft }, null, 2)
    });
    const structured = model.withStructuredOutput(PublishableArticleSchema);
    return await structured.invoke(prompt);
  } catch {
    return buildFallbackPublishable(requirement, draft);
  }
}
