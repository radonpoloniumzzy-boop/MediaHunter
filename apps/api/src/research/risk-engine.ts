import type { RuleHit, RiskLevel } from "./types";

export interface RuleRecord {
  id: string;
  rule_type: "keyword" | "risk" | "column";
  pattern: string;
  severity: "low" | "medium" | "high" | "blocked";
}

function collectHits(haystack: string, pattern: string): number {
  if (!pattern.trim()) return 0;
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = haystack.match(new RegExp(escaped, "gi"));
  return matches?.length ?? 0;
}

export function evaluateRules(
  title: string,
  contentText: string,
  rules: RuleRecord[]
): {
  hits: RuleHit[];
  riskLevel: RiskLevel;
  columnType: string | null;
} {
  const hits: RuleHit[] = [];
  let columnType: string | null = null;
  let riskLevel: RiskLevel = "low";

  for (const rule of rules) {
    const titleHits = collectHits(title, rule.pattern);
    const contentHits = collectHits(contentText, rule.pattern);
    const totalHits = titleHits + contentHits;
    if (!totalHits) continue;

    if (titleHits) {
      hits.push({
        rule_id: rule.id,
        rule_type: rule.rule_type,
        severity: rule.severity,
        hit_text: rule.pattern,
        location: "title",
        hit_count: titleHits
      });
    }

    if (contentHits) {
      hits.push({
        rule_id: rule.id,
        rule_type: rule.rule_type,
        severity: rule.severity,
        hit_text: rule.pattern,
        location: "content",
        hit_count: contentHits
      });
    }

    if (rule.rule_type === "column" && columnType === null) {
      columnType = rule.pattern;
    }

    if (rule.rule_type === "risk") {
      if (rule.severity === "blocked") {
        riskLevel = "blocked";
      } else if (rule.severity === "high" && riskLevel !== "blocked") {
        riskLevel = "high";
      } else if (rule.severity === "medium" && riskLevel === "low") {
        riskLevel = "medium";
      }
    }
  }

  return {
    hits,
    riskLevel,
    columnType
  };
}
