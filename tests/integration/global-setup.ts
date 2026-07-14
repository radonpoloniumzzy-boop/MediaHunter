import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function setup() {
  try {
    await execFileAsync("docker", ["info", "--format", "{{.ServerVersion}}"], {
      timeout: 10_000,
      windowsHide: true
    });
  } catch (error) {
    throw new Error(
      "Integration tests require a running Docker Desktop. Start Docker Desktop and rerun pnpm test:integration.",
      { cause: error }
    );
  }
}
