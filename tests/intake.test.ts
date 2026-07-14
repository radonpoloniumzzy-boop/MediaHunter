import { describe, expect, it } from "vitest";

import { buildRequirementDoc, createRequirementProgress } from "../packages/workflow/src/intake";

describe("Anshi intake", () => {
  it("extracts a structured requirement document from a single strong prompt", () => {
    const doc = buildRequirementDoc("req-1", [
      {
        role: "user",
        content: "Write a deep piece about AI infrastructure and A-share risk appetite for public account readers with a sharp tone and 2200 words."
      }
    ]);

    expect(doc.topic).toContain("AI infrastructure");
    expect(doc.target_audience).toContain("公众号");
    expect(doc.region_market).toContain("A股");
    expect(doc.length_target).toContain("2200");
  });

  it("uses defaults after repeated vague user turns", () => {
    const progress = createRequirementProgress("req-2", [
      { role: "user", content: "I want a finance topic." },
      { role: "assistant", content: "Please add audience and length." },
      { role: "user", content: "You decide, default is fine." }
    ]);

    expect(progress.ready).toBe(true);
    expect(progress.requirementDoc.missing_slots.length).toBeGreaterThan(0);
    expect(progress.requirementDoc.target_audience).toContain("金融");
  });
});
