import { bootstrapEnv } from "./bootstrap-env";
import { createApplication } from "./application";
import { loadEnv } from "./env";

async function main() {
  bootstrapEnv();
  const env = loadEnv(process.env);
  const runtime = await createApplication({ env });

  try {
    await runtime.app.listen({
      host: "0.0.0.0",
      port: env.API_PORT
    });
  } catch (error) {
    await runtime.close();
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
