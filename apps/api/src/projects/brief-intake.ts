import type { BriefQuestion, ProjectBrief } from "./types";

function includesAny(input: string, values: string[]) {
  return values.some((value) => input.toLowerCase().includes(value.toLowerCase()));
}

export function organizeProjectBrief(rawRequest: string): ProjectBrief {
  const changeEvent = includesAny(rawRequest, ["发行", "推出", "上线", "发布", "转型", "新增", "launch", "new product"])
    ? rawRequest
    : null;
  const targetAudience = includesAny(rawRequest, ["投资人", "客户", "用户", "消费者", "机构", "audience", "reader"])
    ? rawRequest.match(/(?:投资人|客户|用户|消费者|机构)/)?.[0] ?? "目标受众见原始需求"
    : null;
  const communicationGoal = includesAny(rawRequest, ["目的", "告诉", "传达", "宣传", "认知", "希望", "提升", "获客", "转化", "goal"])
    ? rawRequest
    : null;

  return {
    business_context: rawRequest,
    change_event: changeEvent,
    target_audience: targetAudience,
    communication_goal: communicationGoal,
    constraints: [],
    deliverables: ["Research Workpaper", "Client Strategy Plan"]
  };
}

export function getMaterialQuestions(brief: ProjectBrief): BriefQuestion[] {
  const questions: BriefQuestion[] = [];
  if (!brief.change_event) {
    questions.push({
      key: "change_event",
      prompt: "这次传播由什么业务变化、产品发布或关键事件触发？",
      reason: "触发事件会改变对标对象、时间范围和内容重点。"
    });
  }
  if (!brief.target_audience) {
    questions.push({
      key: "target_audience",
      prompt: "这次内容首先需要影响哪一类受众？",
      reason: "受众会改变账号选择、内容形式和表达深度。"
    });
  }
  if (!brief.communication_goal) {
    questions.push({
      key: "communication_goal",
      prompt: "受众看完后需要形成什么认知或采取什么行动？",
      reason: "传播目标决定证据筛选和策略交付方向。"
    });
  }
  return questions;
}
