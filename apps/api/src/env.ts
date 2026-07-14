import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  API_PORT: z.coerce.number().default(3001),
  COLLECTOR_POLL_INTERVAL_MS: z.coerce.number().default(4000),
  COLLECTOR_GLOBAL_CONCURRENCY: z.coerce.number().default(3),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().optional(),
  OPENAI_BASE_URL: z.string().optional()
});

export type AppEnv = z.infer<typeof EnvSchema>;

export function loadEnv(env: NodeJS.ProcessEnv): AppEnv {
  return EnvSchema.parse({
    DATABASE_URL: env.DATABASE_URL,
    API_PORT: env.API_PORT,
    COLLECTOR_POLL_INTERVAL_MS: env.COLLECTOR_POLL_INTERVAL_MS,
    COLLECTOR_GLOBAL_CONCURRENCY: env.COLLECTOR_GLOBAL_CONCURRENCY,
    OPENAI_API_KEY: env.OPENAI_API_KEY,
    OPENAI_MODEL: env.OPENAI_MODEL,
    OPENAI_BASE_URL: env.OPENAI_BASE_URL
  });
}
