import { bootstrapEnv } from "./bootstrap-env";
import { createDatabaseConnection, ensureSchema } from "./db";
import { loadEnv } from "./env";
import { ResearchRepository } from "./research/research-repository";
import { ResearchService } from "./research/research-service";

async function main() {
  bootstrapEnv();
  const env = loadEnv(process.env);
  const sql = await createDatabaseConnection(env.DATABASE_URL);
  await ensureSchema(sql);

  const repo = new ResearchRepository(sql);
  const service = new ResearchService(repo, env);

  await service.runWorkerLoop();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
