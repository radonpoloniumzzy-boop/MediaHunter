import { Annotation, END, START, StateGraph } from "@langchain/langgraph";

import { retrieveResearchBundle } from "@lan-ting/rag";

import { generateDraftArticle, polishArticle } from "./agents";
import {
  WorkflowResultSchema,
  type DraftArticle,
  type PublishableArticle,
  type RequirementDoc,
  type WorkflowRuntimeOptions,
  type WorkflowStatus
} from "./types";

const WorkflowGraphState = Annotation.Root({
  requirement: Annotation<RequirementDoc>(),
  research: Annotation({
    reducer: (_left: ReturnType<typeof retrieveResearchBundle> | null, right: ReturnType<typeof retrieveResearchBundle> | null) => right,
    default: () => null
  }),
  draft: Annotation({
    reducer: (_left: DraftArticle | null, right: DraftArticle | null) => right,
    default: () => null
  }),
  publishable: Annotation({
    reducer: (_left: PublishableArticle | null, right: PublishableArticle | null) => right,
    default: () => null
  }),
  status: Annotation({
    reducer: (_left: WorkflowStatus, right: WorkflowStatus) => right,
    default: () => "researching" as WorkflowStatus
  })
});

export type CompiledWorkflowState = typeof WorkflowGraphState.State;

export function createWorkflow(runtime: WorkflowRuntimeOptions) {
  return new StateGraph(WorkflowGraphState)
    .addNode("collect_research", async (state) => ({
      research: retrieveResearchBundle(state.requirement),
      status: "drafting" as WorkflowStatus
    }))
    .addNode("generate_draft", async (state) => ({
      draft: await generateDraftArticle(state.requirement, state.research!, runtime),
      status: "polishing" as WorkflowStatus
    }))
    .addNode("polish_draft", async (state) => ({
      publishable: await polishArticle(state.requirement, state.research!, state.draft!, runtime),
      status: "pending_review" as WorkflowStatus
    }))
    .addEdge(START, "collect_research")
    .addEdge("collect_research", "generate_draft")
    .addEdge("generate_draft", "polish_draft")
    .addEdge("polish_draft", END)
    .compile();
}

export async function runWorkflow(requirement: RequirementDoc, runtime: WorkflowRuntimeOptions) {
  const workflow = createWorkflow(runtime);
  const result = await workflow.invoke({
    requirement,
    research: null,
    draft: null,
    publishable: null,
    status: "researching" as WorkflowStatus
  });

  return WorkflowResultSchema.parse({
    status: result.status,
    requirement: result.requirement,
    research: result.research,
    draft: result.draft,
    publishable: result.publishable
  });
}
