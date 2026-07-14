export interface SourceDocument {
  source_id: string;
  title: string;
  url: string;
  published_at: string;
  fetched_at: string;
  keywords: string[];
  markets: string[];
  excerpt: string;
}

export const SOURCE_CATALOG: SourceDocument[] = [
  {
    source_id: "pbc-policy-2025-q4",
    title: "PBOC Monetary Policy Implementation Report Q4 2025",
    url: "https://www.pbc.gov.cn/example/monetary-policy-2025-q4",
    published_at: "2026-02-15",
    fetched_at: "2026-03-24T20:00:00+08:00",
    keywords: ["china", "liquidity", "policy", "interest rates", "financing cost", "banks"],
    markets: ["CN", "A-share"],
    excerpt:
      "The report emphasizes ample liquidity, lower social financing costs, and targeted support for technology innovation and manufacturing upgrades."
  },
  {
    source_id: "fed-minutes-2026-01",
    title: "Federal Reserve Minutes January 2026",
    url: "https://www.federalreserve.gov/example/minutes-2026-01.htm",
    published_at: "2026-01-28",
    fetched_at: "2026-03-24T20:00:00+08:00",
    keywords: ["fed", "rate cuts", "inflation", "us equities", "usd", "macro"],
    markets: ["US", "US equities"],
    excerpt:
      "The minutes show a cautious stance on inflation and emphasize data dependence while weighing how easier financial conditions may affect asset prices."
  },
  {
    source_id: "sse-ai-infra-2026",
    title: "Shanghai Exchange Industry Note: AI Infrastructure and Capex",
    url: "https://www.sse.com.cn/example/ai-infra-2026",
    published_at: "2026-03-01",
    fetched_at: "2026-03-24T20:00:00+08:00",
    keywords: ["ai", "infrastructure", "capex", "semiconductors", "a-share", "technology"],
    markets: ["CN", "A-share"],
    excerpt:
      "Capital expenditure is shifting from training clusters toward inference infrastructure, broadening the beneficiary chain beyond GPUs into optical modules, power, and cooling."
  },
  {
    source_id: "csrc-etf-2026",
    title: "ETF Flow Watch: Risk Appetite and Monthly Rotation",
    url: "https://www.csrc.gov.cn/example/etf-flow-2026",
    published_at: "2026-03-10",
    fetched_at: "2026-03-24T20:00:00+08:00",
    keywords: ["etf", "fund flow", "risk appetite", "a-share", "index investing"],
    markets: ["CN", "A-share"],
    excerpt:
      "ETF inflows concentrate in broad indices and dividend themes, showing a mix of defense and selective offense, with retail subscriptions still highly event-driven."
  },
  {
    source_id: "hkex-bank-valuation-2026",
    title: "HKEX Sector Brief: Bank Valuation Repair and Dividend Logic",
    url: "https://www.hkex.com.hk/example/bank-valuation-2026",
    published_at: "2026-02-20",
    fetched_at: "2026-03-24T20:00:00+08:00",
    keywords: ["banks", "valuation", "dividend", "hong kong", "spread"],
    markets: ["HK", "HK equities"],
    excerpt:
      "Bank valuation repair is supported by dividend certainty, stable capital ratios, and better asset-quality expectations, though net interest margin remains the main constraint."
  },
  {
    source_id: "caixin-consumer-2026",
    title: "Consumer Recovery: Pace, Segmentation, and Asset Mapping",
    url: "https://www.caixin.com/example/consumer-recovery-2026",
    published_at: "2026-03-05",
    fetched_at: "2026-03-24T20:00:00+08:00",
    keywords: ["consumption", "china", "recovery", "travel", "consumer", "a-share"],
    markets: ["CN", "A-share"],
    excerpt:
      "Consumer recovery is not uniform. It moves through high-frequency services, travel chains, and optional consumption, with asset performance determined by earnings delivery speed."
  }
];
