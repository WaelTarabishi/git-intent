import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { loadEnvFile } from "node:process";

const GEMINI_KEY_LINE = /^\s*(?:GEMINI_API_KEY|GOOGLE_API_KEY)\s*=/u;

export function globalEnvironmentFile(
  homeDirectory = homedir(),
): string {
  return path.join(homeDirectory, ".git-intent", ".env");
}

export function loadProjectEnvironment(
  environmentFile = path.resolve(process.cwd(), ".env"),
): boolean {
  if (!existsSync(environmentFile)) {
    return false;
  }

  loadEnvFile(environmentFile);
  return true;
}

export interface LoadedEnvironmentFiles {
  project: boolean;
  global: boolean;
}

export function loadGitIntentEnvironment(
  projectEnvironmentFile = path.resolve(process.cwd(), ".env"),
  userEnvironmentFile = globalEnvironmentFile(),
): LoadedEnvironmentFiles {
  // Node's environment loader preserves variables that are already present.
  // Loading the project first gives the precedence order:
  // shell -> project .env -> user-wide Git Intent configuration.
  const project = loadProjectEnvironment(projectEnvironmentFile);
  const global =
    path.resolve(userEnvironmentFile) === path.resolve(projectEnvironmentFile)
      ? project
      : loadProjectEnvironment(userEnvironmentFile);

  return { project, global };
}

export async function saveGlobalGeminiApiKey(
  apiKey: string,
  environmentFile = globalEnvironmentFile(),
): Promise<string> {
  const normalizedApiKey = apiKey.trim();
  if (normalizedApiKey.length === 0) {
    throw new Error("Gemini API key cannot be empty.");
  }
  if (/[\r\n\0]/u.test(normalizedApiKey)) {
    throw new Error("Gemini API key contains invalid characters.");
  }

  let existingContent = "";
  try {
    existingContent = await readFile(environmentFile, "utf8");
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      error.code !== "ENOENT"
    ) {
      throw error;
    }
  }

  const retainedLines = existingContent
    .split(/\r?\n/u)
    .filter((line) => !GEMINI_KEY_LINE.test(line));
  while (retainedLines.at(-1) === "") {
    retainedLines.pop();
  }
  retainedLines.push(`GEMINI_API_KEY=${normalizedApiKey}`, "");

  await mkdir(path.dirname(environmentFile), {
    recursive: true,
    mode: 0o700,
  });
  await writeFile(environmentFile, retainedLines.join("\n"), {
    encoding: "utf8",
    mode: 0o600,
  });
  await chmod(environmentFile, 0o600);
  return environmentFile;
}
