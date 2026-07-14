import { z } from "zod";

import { SOURCE_CATALOG, type SourceDocument } from "./catalog";

export const SourceDocumentSchema = z.object({
  source_id: z.string(),
  title: z.string(),
  url: z.string().url(),
  published_at: z.string(),
  fetched_at: z.string(),
  keywords: z.array(z.string()),
  markets: z.array(z.string()),
  excerpt: z.string()
});

export const CitationSchema = z.object({
  citation_id: z.string(),
  source_id: z.string(),
  title: z.string(),
  url: z.string().url(),
  published_at: z.string(),
  excerpt: z.string()
});

export const ResearchBundleSchema = z.object({
  query_plan: z.array(z.string()),
  sources: z.array(SourceDocumentSchema),
  citations: z.array(CitationSchema),
  coverage_gaps: z.array(z.string())
});

export type ResearchBundle = z.infer<typeof ResearchBundleSchema>;

export interface RequirementLike {
  topic: string;
  target_audience: string;
  region_market: string;
  seo_keywords: string[];
  must_cover: string[];
  freshness_requirement: string;
}

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[\s,"()\-/:]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function scoreSource(source: SourceDocument, tokens: string[], regionMarket: string): number {
  const keywordHits = source.keywords.filter((keyword) =>
    tokens.some((token) => keyword.toLowerCase().includes(token) || token.includes(keyword.toLowerCase()))
  ).length;
  const regionHit = source.markets.some((market) => regionMarket.includes(market)) ? 2 : 0;
  return keywordHits + regionHit;
}

export function buildQueryPlan(requirement: RequirementLike): string[] {
  return [
    `Topic decomposition: ${requirement.topic}`,
    `Audience: ${requirement.target_audience}`,
    `Market scope: ${requirement.region_market}`,
    `Search keywords: ${[requirement.topic, ...requirement.seo_keywords, ...requirement.must_cover].join(" / ")}`,
    `Freshness target: ${requirement.freshness_requirement}`
  ];
}

export function retrieveResearchBundle(requirement: RequirementLike): ResearchBundle {
  const tokens = tokenize(
    [requirement.topic, requirement.target_audience, requirement.region_market, ...requirement.seo_keywords, ...requirement.must_cover].join(" ")
  );

  const ranked = [...SOURCE_CATALOG]
    .map((source) => ({
      source,
      score: scoreSource(source, tokens, requirement.region_market)
    }))
    .sort((left, right) => right.score - left.score);

  const selected = ranked.slice(0, 4).map((entry) => entry.source);
  const citations = selected.map((source, index) => ({
    citation_id: `cite-${index + 1}`,
    source_id: source.source_id,
    title: source.title,
    url: source.url,
    published_at: source.published_at,
    excerpt: source.excerpt
  }));

  const coverageGaps =
    ranked[0]?.score > 0
      ? []
      : [
          "Whitelisted sources are only weakly matched to this topic, so unsupported claims must be labeled as analysis.",
          "Consider adding sector research or filings before final release."
        ];

  return ResearchBundleSchema.parse({
    query_plan: buildQueryPlan(requirement),
    sources: selected,
    citations,
    coverage_gaps: coverageGaps
  });
}
