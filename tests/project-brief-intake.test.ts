import { describe, expect, it } from "vitest";

import { getMaterialQuestions, organizeProjectBrief } from "../apps/api/src/projects/brief-intake";
import { buildSkillProjectIntake, isProjectResearchRequest } from "../apps/api/src/projects/skill-router";

describe("project brief intake", () => {
  it("asks only for material research direction gaps", () => {
    const brief = organizeProjectBrief("为一家企业规划公众号内容。希望提升品牌形象。");
    expect(getMaterialQuestions(brief).map((question) => question.key)).toEqual(["change_event", "target_audience"]);
    expect(brief.deliverables).toEqual(["Research Workpaper", "Client Strategy Plan"]);
  });

  it("routes a project research request from the mediahunter skill to the shared intake API", () => {
    const input = "为一家私募基金寻找对标公司、对标账号并规划品牌宣传运营方案";
    expect(isProjectResearchRequest(input)).toBe(true);
    expect(buildSkillProjectIntake(input)).toEqual({
      method: "POST",
      path: "/api/research-projects",
      body: { raw_request: input, intake_source: "skill" }
    });
    expect(buildSkillProjectIntake("今天有哪些新增文章")).toBeNull();
  });
});
