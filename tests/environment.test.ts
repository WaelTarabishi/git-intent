import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  globalEnvironmentFile,
  loadGitIntentEnvironment,
  loadProjectEnvironment,
  saveGlobalGeminiApiKey,
} from "../src/config/environment.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("loadProjectEnvironment", () => {
  it("loads variables from an existing .env file", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "git-intent-env-"));
    temporaryDirectories.push(directory);
    const environmentFile = path.join(directory, ".env");
    await writeFile(
      environmentFile,
      "GEMINI_API_KEY=placeholder-test-key\n",
    );
    vi.stubEnv("GEMINI_API_KEY", undefined);

    expect(loadProjectEnvironment(environmentFile)).toBe(true);
    expect(process.env.GEMINI_API_KEY).toBe("placeholder-test-key");
  });

  it("does not overwrite a variable already set by the shell", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "git-intent-env-"));
    temporaryDirectories.push(directory);
    const environmentFile = path.join(directory, ".env");
    await writeFile(environmentFile, "GEMINI_API_KEY=file-key\n");
    vi.stubEnv("GEMINI_API_KEY", "shell-key");

    loadProjectEnvironment(environmentFile);

    expect(process.env.GEMINI_API_KEY).toBe("shell-key");
  });

  it("allows projects without a .env file", () => {
    expect(
      loadProjectEnvironment(
        path.join(tmpdir(), "missing-git-intent-environment-file"),
      ),
    ).toBe(false);
  });
});

describe("global Git Intent environment", () => {
  it("uses a stable per-user configuration path", () => {
    expect(globalEnvironmentFile("C:/Users/example")).toBe(
      path.join("C:/Users/example", ".git-intent", ".env"),
    );
  });

  it("loads project configuration before user-wide configuration", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "git-intent-env-"));
    temporaryDirectories.push(directory);
    const projectEnvironmentFile = path.join(directory, "project.env");
    const userEnvironmentFile = path.join(directory, "user.env");
    await writeFile(
      projectEnvironmentFile,
      "GEMINI_API_KEY=project-key\n",
    );
    await writeFile(
      userEnvironmentFile,
      "GEMINI_API_KEY=user-key\nGIT_INTENT_GEMINI_MODEL=user-model\n",
    );
    vi.stubEnv("GEMINI_API_KEY", undefined);
    vi.stubEnv("GIT_INTENT_GEMINI_MODEL", undefined);

    expect(
      loadGitIntentEnvironment(
        projectEnvironmentFile,
        userEnvironmentFile,
      ),
    ).toEqual({ project: true, global: true });
    expect(process.env.GEMINI_API_KEY).toBe("project-key");
    expect(process.env.GIT_INTENT_GEMINI_MODEL).toBe("user-model");
  });

  it("saves a Gemini key without retaining conflicting key entries", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "git-intent-env-"));
    temporaryDirectories.push(directory);
    const environmentFile = path.join(directory, ".git-intent", ".env");
    await saveGlobalGeminiApiKey("  first-key  ", environmentFile);
    await writeFile(
      environmentFile,
      "# Git Intent settings\nGOOGLE_API_KEY=old-key\nGIT_INTENT_GEMINI_MODEL=test-model\n",
    );

    await expect(
      saveGlobalGeminiApiKey("replacement-key", environmentFile),
    ).resolves.toBe(environmentFile);

    const content = await readFile(environmentFile, "utf8");
    expect(content).toContain("# Git Intent settings");
    expect(content).toContain("GIT_INTENT_GEMINI_MODEL=test-model");
    expect(content).toContain("GEMINI_API_KEY=replacement-key");
    expect(content).not.toContain("GOOGLE_API_KEY");
    expect(content).not.toContain("old-key");
  });

  it("rejects empty or multiline keys", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "git-intent-env-"));
    temporaryDirectories.push(directory);
    const environmentFile = path.join(directory, ".env");

    await expect(
      saveGlobalGeminiApiKey("   ", environmentFile),
    ).rejects.toThrow("cannot be empty");
    await expect(
      saveGlobalGeminiApiKey("first\nsecond", environmentFile),
    ).rejects.toThrow("invalid characters");
  });
});
