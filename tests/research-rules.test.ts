import { describe, expect, it } from "vitest";

import { evaluateRules } from "../apps/api/src/research/risk-engine";

describe("risk engine", () => {
  it("promotes blocked and column hits into derived article metadata", () => {
    const result = evaluateRules("保本策略月度观点", "这不是公开宣传推介，但包含保本表达。", [
      {
        id: "rule-1",
        rule_type: "risk",
        pattern: "保本",
        severity: "blocked"
      },
      {
        id: "rule-2",
        rule_type: "column",
        pattern: "月度观点",
        severity: "low"
      }
    ]);

    expect(result.riskLevel).toBe("blocked");
    expect(result.columnType).toBe("月度观点");
    expect(result.hits.length).toBeGreaterThan(1);
  });
});
