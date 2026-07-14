import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { PipelineService } from "../services/pipeline-service";

export async function registerRequestRoutes(app: FastifyInstance, pipeline: PipelineService) {
  app.get("/api/requests/:id", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const record = await pipeline.getRequest(params.id);
    if (!record) {
      reply.code(404);
      return { error: "Request not found" };
    }
    return { request: record };
  });

  app.post("/api/workflows/:id/retry", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);

    try {
      const result = await pipeline.retryWorkflow(params.id);
      return { workflow: result };
    } catch (error) {
      if (error instanceof Error && error.message === "REQUEST_NOT_FOUND") {
        reply.code(404);
        return { error: "Request not found" };
      }
      throw error;
    }
  });
}

