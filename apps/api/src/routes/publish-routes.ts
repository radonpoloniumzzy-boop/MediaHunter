import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { PipelineService } from "../services/pipeline-service";

const ReviewBodySchema = z.object({
  action: z.enum(["approve", "request_revision", "reject"]),
  note: z.string().optional()
});

export async function registerPublishRoutes(app: FastifyInstance, pipeline: PipelineService) {
  app.get("/api/publish-queue", async () => ({
    items: await pipeline.listPublishQueue()
  }));

  app.post("/api/publish-queue/:id/review", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = ReviewBodySchema.parse(request.body);
    const item = await pipeline.reviewQueueItem(params.id, body.action, body.note);
    if (!item) {
      reply.code(404);
      return { error: "Queue item not found" };
    }
    return { item };
  });
}

