import { randomUUID } from "node:crypto";

import type { SessionRepository } from "../repositories/session-repository";
import type { RequestRepository } from "../repositories/request-repository";

import { createRequirementProgress } from "@lan-ting/workflow";

import type { AnalysisWorkflowAdapter } from "../external-adapters";

export class PipelineService {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly requests: RequestRepository,
    private readonly analysisWorkflow: AnalysisWorkflowAdapter
  ) {}

  async createSession(title?: string) {
    return this.sessions.createSession(title);
  }

  async getSession(sessionId: string) {
    return this.sessions.getSession(sessionId);
  }

  async listSessions() {
    return this.sessions.listSessions();
  }

  async postUserMessage(sessionId: string, content: string) {
    const session = await this.sessions.getSession(sessionId);
    if (!session) {
      throw new Error("SESSION_NOT_FOUND");
    }

    await this.sessions.appendMessage(sessionId, "user", content);
    const afterUserMessage = await this.sessions.getSession(sessionId);
    if (!afterUserMessage) {
      throw new Error("SESSION_NOT_FOUND");
    }

    const progress = createRequirementProgress(randomUUID(), afterUserMessage.messages);
    await this.sessions.appendMessage(sessionId, "assistant", progress.assistantMessage);

    let requestId: string | null = null;
    let workflowStatus = "collecting_requirements";

    if (progress.ready) {
      requestId = progress.requirementDoc.request_id;
      workflowStatus = "researching";

      await this.requests.createRequest(sessionId, progress.requirementDoc);

      try {
        const result = await this.analysisWorkflow.run(progress.requirementDoc);
        await this.requests.persistWorkflowResult(requestId, result);
        workflowStatus = result.status;

        await this.sessions.appendMessage(
          sessionId,
          "assistant",
          `钟孚和虞玄姬已经交卷。任务 ${requestId} 当前状态为 ${result.status}，成品已进入待审核队列。`
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown workflow error";
        await this.requests.markFailed(requestId, message);
        workflowStatus = "failed";
        await this.sessions.appendMessage(
          sessionId,
          "assistant",
          `工作流执行时出了问题。任务 ${requestId} 已标记为 failed，你可以稍后重试。`
        );
      }
    }

    return {
      session: await this.sessions.getSession(sessionId),
      ready: progress.ready,
      assistantMessage: progress.assistantMessage,
      requirementDoc: progress.requirementDoc,
      requestId,
      workflowStatus
    };
  }

  async getRequest(requestId: string) {
    return this.requests.getRequest(requestId);
  }

  async retryWorkflow(requestId: string) {
    const request = await this.requests.getRequest(requestId);
    if (!request) {
      throw new Error("REQUEST_NOT_FOUND");
    }

    await this.requests.updateWorkflowStatus(requestId, "researching", {
      requirement: request.requirement_doc,
      retried_at: new Date().toISOString()
    });

    const result = await this.analysisWorkflow.run(request.requirement_doc);
    await this.requests.persistWorkflowResult(requestId, result);
    return result;
  }

  async listPublishQueue() {
    return this.requests.listPublishQueue();
  }

  async reviewQueueItem(queueId: string, action: "approve" | "request_revision" | "reject", note?: string) {
    return this.requests.reviewQueueItem(queueId, action, note);
  }
}
