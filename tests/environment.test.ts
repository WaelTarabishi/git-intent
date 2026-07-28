import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { loadProjectEnvironment } from "../src/config/environment.js";

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
