import Fastify from "fastify";
import cors from "@fastify/cors";

import type { PipelineService } from "./services/pipeline-service";
import type { IncubationService } from "./incubation/service";
import type { ResearchService } from "./research/research-service";
import type { ContentService } from "./content/service";
import { registerChatRoutes } from "./routes/chat-routes";
import { registerIncubationRoutes } from "./routes/incubation-routes";
import { registerPublishRoutes } from "./routes/publish-routes";
import { registerRequestRoutes } from "./routes/request-routes";
import { registerResearchRoutes } from "./routes/research-routes";
import { registerContentRoutes } from "./routes/content-routes";

export async function createApp(
  pipeline: PipelineService,
  research: ResearchService,
  incubation?: IncubationService,
  content?: ContentService,
  options?: { logger?: boolean }
) {
  const app = Fastify({
    logger: options?.logger ?? true
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
  if (content) {
    await registerContentRoutes(app, content, research);
  }
  if (incubation) {
    await registerIncubationRoutes(app, incubation, research);
  }

  return app;
}
