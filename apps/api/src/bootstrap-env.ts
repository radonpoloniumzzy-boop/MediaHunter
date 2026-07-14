import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "dotenv";

const currentDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(currentDir, "../../..");

export function bootstrapEnv(): void {
  const baseEnv = resolve(workspaceRoot, ".env");
  const localEnv = resolve(workspaceRoot, ".env.local");

  if (existsSync(baseEnv)) {
    config({ path: baseEnv });
  }

  if (existsSync(localEnv)) {
    config({ path: localEnv, override: true });
  }
}

