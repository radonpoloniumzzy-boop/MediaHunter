import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { PipelineService } from "../services/pipeline-service";

const CreateSessionBodySchema = z.object({
  title: z.string().optional()
});

const PostMessageBodySchema = z.object({
  content: z.string().min(1)
});

export async function registerChatRoutes(app: FastifyInstance, pipeline: PipelineService) {
  app.get("/api/chat/sessions", async () => ({
    sessions: await pipeline.listSessions()
  }));

  app.post("/api/chat/sessions", async (request, reply) => {
    const body = CreateSessionBodySchema.parse(request.body ?? {});
    const session = await pipeline.createSession(body.title);
    reply.code(201);
    return { session };
  });

  app.get("/api/chat/sessions/:id", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const session = await pipeline.getSession(params.id);
    if (!session) {
      reply.code(404);
      return { error: "Session not found" };
    }
    return { session };
  });

  app.post("/api/chat/sessions/:id/messages", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = PostMessageBodySchema.parse(request.body);

    try {
      const result = await pipeline.postUserMessage(params.id, body.content);
      reply.code(201);
      return result;
    } catch (error) {
      if (error instanceof Error && error.message === "SESSION_NOT_FOUND") {
        reply.code(404);
        return { error: "Session not found" };
      }
      throw error;
    }
  });
}

