import { bootstrapEnv } from "./bootstrap-env";
import { createDatabaseConnection, ensureSchema } from "./db";
import { loadEnv } from "./env";
import { RequestRepository } from "./repositories/request-repository";
import { SessionRepository } from "./repositories/session-repository";
import { PipelineService } from "./services/pipeline-service";
import { createApp } from "./app";
import { IncubationRepository } from "./incubation/repository";
import { IncubationService } from "./incubation/service";
import { ResearchRepository } from "./research/research-repository";
import { ResearchService } from "./research/research-service";

async function main() {
  bootstrapEnv();
  const env = loadEnv(process.env);
  const sql = await createDatabaseConnection(env.DATABASE_URL);
  await ensureSchema(sql);

  const sessions = new SessionRepository(sql);
  const requests = new RequestRepository(sql);
  const researchRepo = new ResearchRepository(sql);
  const incubationRepo = new IncubationRepository(sql);
  const pipeline = new PipelineService(sessions, requests, {
    openAIApiKey: env.OPENAI_API_KEY,
    openAIModel: env.OPENAI_MODEL,
    openAIBaseUrl: env.OPENAI_BASE_URL
  });
  const research = new ResearchService(researchRepo, env);
  const incubation = new IncubationService(incubationRepo);

  const app = await createApp(pipeline, research, incubation);

  await app.listen({
    host: "0.0.0.0",
    port: env.API_PORT
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
