import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { ContentFetchError, type ContentService } from "../content/service";
import type { ResearchService } from "../research/research-service";
import { requireUser } from "./auth-guard";

const SubmitArticleSchema = z.object({ url: z.string().url() });

export async function registerContentRoutes(
  app: FastifyInstance,
  content: ContentService,
  research: ResearchService
) {
  app.get("/api/content/migrations/legacy/status", async (request, reply) => {
    if (!(await requireUser(request, reply, research, "tasks:read"))) return { error: "未授权" };
    return content.getLegacyMigrationReadiness();
  });

  app.post("/api/content/migrations/legacy/run", async (request, reply) => {
    if (!(await requireUser(request, reply, research, "tasks:write"))) return { error: "未授权" };
    return content.migrateLegacyArticles();
  });

  app.post("/api/content/articles/submit", async (request, reply) => {
    if (!(await requireUser(request, reply, research, "tasks:write"))) return { error: "未授权" };
    const body = SubmitArticleSchema.parse(request.body);
    try {
      const result = await content.submitPublicArticle(body.url);
      reply.code(result.created ? 201 : 200);
      return result;
    } catch (error) {
      if (error instanceof ContentFetchError) {
        reply.code(422);
        return { error: error.detail };
      }
      if (error instanceof Error && error.message === "CONTENT_TOMBSTONED") {
        reply.code(409);
        return { error: "文章已删除并保留来源墓碑，不能自动恢复正文" };
      }
      throw error;
    }
  });

  app.get("/api/content/articles/:id", async (request, reply) => {
    if (!(await requireUser(request, reply, research, "articles:read"))) return { error: "未授权" };
    const params = z.object({ id: z.string() }).parse(request.params);
    const detail = await content.getArticleDetail(params.id);
    if (!detail) {
      reply.code(404);
      return { error: "文章不存在" };
    }
    return detail;
  });
}
