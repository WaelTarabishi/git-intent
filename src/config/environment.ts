import { existsSync } from "node:fs";
import path from "node:path";
import { loadEnvFile } from "node:process";

export function loadProjectEnvironment(
  environmentFile = path.resolve(process.cwd(), ".env"),
): boolean {
  if (!existsSync(environmentFile)) {
    return false;
  }

  loadEnvFile(environmentFile);
  return true;
}
