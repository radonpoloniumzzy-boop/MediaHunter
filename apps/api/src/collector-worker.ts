import { bootstrapEnv } from "./bootstrap-env";
import { createServiceContainer } from "./application";
import { loadEnv } from "./env";

async function main() {
  bootstrapEnv();
  const env = loadEnv(process.env);
  const container = await createServiceContainer({ env });

  try {
    await container.services.research.runWorkerLoop();
  } finally {
    await container.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
