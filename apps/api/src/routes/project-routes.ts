import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { ProjectService } from "../projects/service";
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
}
