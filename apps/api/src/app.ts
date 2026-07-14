import Fastify from "fastify";
import cors from "@fastify/cors";

import type { PipelineService } from "./services/pipeline-service";
import type { IncubationService } from "./incubation/service";
import { ResearchService } from "./research/research-service";
import { registerChatRoutes } from "./routes/chat-routes";
import { registerIncubationRoutes } from "./routes/incubation-routes";
import { registerPublishRoutes } from "./routes/publish-routes";
import { registerRequestRoutes } from "./routes/request-routes";
import { registerResearchRoutes } from "./routes/research-routes";

export async function createApp(pipeline: PipelineService, research: ResearchService, incubation?: IncubationService) {
  const app = Fastify({
    logger: true
  });

  await app.register(cors, {
    origin: true
  });

  app.get("/api/health", async () => ({
    ok: true
  }));

  await registerChatRoutes(app, pipeline);
  await registerRequestRoutes(app, pipeline);
  await registerPublishRoutes(app, pipeline);
  await registerResearchRoutes(app, research);
  if (incubation) {
    await registerIncubationRoutes(app, incubation, research);
  }

  return app;
}
