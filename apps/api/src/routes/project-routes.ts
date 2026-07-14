import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";

import { ProjectDiscoveryError, type ProjectService } from "../projects/service";
import type { ResearchService } from "../research/research-service";
import { requireUser } from "./auth-guard";

const CreateSchema = z.object({
  raw_request: z.string().min(10),
  name: z.string().optional(),
  intake_source: z.enum(["web", "skill"]).optional()
});
const AnswerSchema = z.object({
  question_key: z.enum(["change_event", "target_audience", "communication_goal"]),
  answer: z.string().min(1)
});
const BriefPatchSchema = z.object({
  patch: z.object({
    business_context: z.string().optional(),
    change_event: z.string().nullable().optional(),
    target_audience: z.string().nullable().optional(),
    communication_goal: z.string().nullable().optional(),
    constraints: z.array(z.string()).optional(),
    deliverables: z.array(z.string()).optional()
  }),
  note: z.string().optional()
});
const DiscoveryRunSchema = z.object({ urls: z.array(z.string().min(1)).min(1).max(30) });
const EvidenceStatusSchema = z.enum(["candidate", "included", "excluded"]);
const EvidencePatchSchema = z.object({
  status: EvidenceStatusSchema,
  decision_reason: z.string().nullable().optional()
});

function handleDiscoveryError(error: unknown, reply: FastifyReply) {
  if (!(error instanceof ProjectDiscoveryError)) throw error;
  const responses = {
    PROJECT_NOT_FOUND: [404, "项目不存在"],
    PROJECT_NOT_READY: [409, "Project Brief 尚未确认并启动研究"],
    INVALID_URL: [400, "仅支持有效的 mp.weixin.qq.com 公开文章 URL"],
    INVALID_DECISION: [400, "排除证据时必须填写理由"],
    NO_FAILED_ITEMS: [409, "该运行没有可重试的失败项"]
  } as const;
  const [status, message] = responses[error.code];
  reply.code(status);
  return { error: message };
}

export async function registerProjectRoutes(app: FastifyInstance, projects: ProjectService, research: ResearchService) {
  app.get("/api/research-projects", async (request, reply) => {
    if (!(await requireUser(request, reply, research, "tasks:read"))) return { error: "未授权" };
    return { items: await projects.list() };
  });

  app.post("/api/research-projects", async (request, reply) => {
    const user = await requireUser(request, reply, research, "tasks:write");
    if (!user) return { error: "未授权" };
    const result = await projects.create(user, CreateSchema.parse(request.body));
    reply.code(201);
    return result;
  });

  app.get("/api/research-projects/:id", async (request, reply) => {
    if (!(await requireUser(request, reply, research, "tasks:read"))) return { error: "未授权" };
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const result = await projects.get(id);
    if (!result) reply.code(404);
    return result ?? { error: "项目不存在" };
  });

  app.post("/api/research-projects/:id/answers", async (request, reply) => {
    const user = await requireUser(request, reply, research, "tasks:write");
    if (!user) return { error: "未授权" };
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = AnswerSchema.parse(request.body);
    const result = await projects.answer(user, id, body.question_key, body.answer);
    if (!result) reply.code(404);
    return result ?? { error: "项目不存在" };
  });

  app.put("/api/research-projects/:id/brief", async (request, reply) => {
    const user = await requireUser(request, reply, research, "tasks:write");
    if (!user) return { error: "未授权" };
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = BriefPatchSchema.parse(request.body);
    const result = await projects.revise(user, id, body.patch, body.note);
    if (!result) reply.code(404);
    return result ?? { error: "项目不存在" };
  });

  app.post("/api/research-projects/:id/confirm", async (request, reply) => {
    const user = await requireUser(request, reply, research, "tasks:write");
    if (!user) return { error: "未授权" };
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ note: z.string().optional() }).parse(request.body ?? {});
    try {
      const result = await projects.confirm(user, id, body.note);
      if (!result) reply.code(404);
      return result ?? { error: "项目不存在" };
    } catch (error) {
      if (error instanceof Error && error.message === "BRIEF_INCOMPLETE") {
        reply.code(409);
        return { error: "仍有会改变研究范围的关键问题未回答" };
      }
      throw error;
    }
  });

  app.post("/api/research-projects/:id/start", async (request, reply) => {
    if (!(await requireUser(request, reply, research, "tasks:write"))) return { error: "未授权" };
    const { id } = z.object({ id: z.string() }).parse(request.params);
    try {
      const result = await projects.start(id);
      if (!result) reply.code(404);
      return result ?? { error: "项目不存在" };
    } catch (error) {
      if (error instanceof Error && error.message === "BRIEF_NOT_CONFIRMED") {
        reply.code(409);
        return { error: "Project Brief 尚未确认，不能启动研究" };
      }
      throw error;
    }
  });

  app.post("/api/research-projects/:id/discovery-runs", async (request, reply) => {
    const user = await requireUser(request, reply, research, "tasks:write");
    if (!user) return { error: "未授权" };
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const parsed = DiscoveryRunSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: "请提交 1–30 个微信公众号文章 URL" };
    }
    try {
      const result = await projects.runManualDiscovery(user, id, parsed.data.urls);
      reply.code(201);
      return result;
    } catch (error) {
      return handleDiscoveryError(error, reply);
    }
  });

  app.get("/api/research-projects/:id/discovery-runs/latest", async (request, reply) => {
    if (!(await requireUser(request, reply, research, "tasks:read"))) return { error: "未授权" };
    const { id } = z.object({ id: z.string() }).parse(request.params);
    return (await projects.getLatestDiscoveryRun(id)) ?? { run: null, items: [] };
  });

  app.post("/api/research-projects/:id/discovery-runs/:runId/retry-failed", async (request, reply) => {
    const user = await requireUser(request, reply, research, "tasks:write");
    if (!user) return { error: "未授权" };
    const { id, runId } = z.object({ id: z.string(), runId: z.string() }).parse(request.params);
    try {
      const result = await projects.retryFailedDiscovery(user, id, runId);
      reply.code(201);
      return result;
    } catch (error) {
      return handleDiscoveryError(error, reply);
    }
  });

  app.get("/api/research-projects/:id/evidence", async (request, reply) => {
    if (!(await requireUser(request, reply, research, "tasks:read"))) return { error: "未授权" };
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const { status } = z.object({ status: EvidenceStatusSchema.optional() }).parse(request.query);
    return { items: await projects.listEvidence(id, status) };
  });

  app.patch("/api/research-projects/:id/evidence/:evidenceId", async (request, reply) => {
    const user = await requireUser(request, reply, research, "tasks:write");
    if (!user) return { error: "未授权" };
    const { id, evidenceId } = z.object({ id: z.string(), evidenceId: z.string() }).parse(request.params);
    const body = EvidencePatchSchema.parse(request.body);
    try {
      const updated = await projects.updateEvidence(user, id, evidenceId, body.status, body.decision_reason);
      if (!updated) {
        reply.code(404);
        return { error: "项目证据不存在" };
      }
      return { item: (await projects.listEvidence(id)).find((item) => item.id === evidenceId) };
    } catch (error) {
      return handleDiscoveryError(error, reply);
    }
  });

  app.get("/api/research-projects/:id/evidence/export", async (request, reply) => {
    if (!(await requireUser(request, reply, research, "exports:write"))) return { error: "未授权" };
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const { format } = z.object({ format: z.enum(["md", "csv"]).default("md") }).parse(request.query);
    try {
      const result = await projects.exportEvidence(id, format);
      reply.header("content-type", result.contentType);
      reply.header("content-disposition", `attachment; filename="${result.filename}"`);
      return result.content;
    } catch (error) {
      return handleDiscoveryError(error, reply);
    }
  });
}
