const PROJECT_SIGNALS = ["专项调研", "对标公司", "对标账号", "运营方案", "品牌宣传", "内容方案", "research project"];

export function isProjectResearchRequest(input: string) {
  const normalized = input.toLowerCase();
  return PROJECT_SIGNALS.some((signal) => normalized.includes(signal.toLowerCase()));
}

export function buildSkillProjectIntake(input: string) {
  if (!isProjectResearchRequest(input)) return null;
  return {
    method: "POST" as const,
    path: "/api/research-projects",
    body: { raw_request: input, intake_source: "skill" as const }
  };
}
