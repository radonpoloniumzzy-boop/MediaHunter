import { describe, expect, it } from "vitest";

import { getProjectActionState } from "../apps/web/src/project-workspace-state";

describe("research project workspace actions", () => {
  it("keeps confirmation and research locked while material questions remain", () => {
    expect(getProjectActionState("brief_draft", 1)).toEqual({ canConfirm: false, canStart: false });
  });

  it("allows confirmation after intake and research only after confirmation", () => {
    expect(getProjectActionState("brief_draft", 0)).toEqual({ canConfirm: true, canStart: false });
    expect(getProjectActionState("brief_confirmed", 0)).toEqual({ canConfirm: false, canStart: true });
    expect(getProjectActionState("research_ready", 0)).toEqual({ canConfirm: false, canStart: false });
  });
});
