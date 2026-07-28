import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { execa } from "execa";
import { afterEach, describe, expect, it } from "vitest";

const temporaryDirectories: string[] = [];
const servers: Server[] = [];
const cliEntry = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
const tsxLoader = import.meta.resolve("tsx");

async function createTemporaryRepository(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "git-intent-suggest-"));
  temporaryDirectories.push(directory);
  await execa("git", ["init"], { cwd: directory });
  return directory;
}

async function git(cwd: string, args: readonly string[]): Promise<string> {
  return (await execa("git", [...args], { cwd })).stdout;
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error === undefined) {
              resolve();
            } else {
              reject(error);
            }
          });
        }),
    ),
  );
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("suggest command integration", () => {
  it("returns Ollama JSON without changing the fixture index or history", async () => {
    const repository = await createTemporaryRepository();
    await writeFile(
      path.join(repository, "feature.ts"),
      "export const enabled = true;\n",
    );
    await git(repository, ["add", "--", "feature.ts"]);

    const before = {
      index: await git(repository, ["diff", "--cached", "--binary"]),
      historyCount: await git(repository, ["rev-list", "--count", "--all"]),
    };

    const server = createServer((_request, response) => {
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          response: JSON.stringify({
            summary: "The staged change adds a feature flag.",
            splitRecommended: false,
            recommendedSuggestionIndex: 0,
            suggestions: [
              {
                type: "feat",
                description: "add feature flag",
                details: ["Expose a new enabled feature flag."],
                tests: [],
                breakingChanges: [],
                explanation: "The staged file introduces a feature flag.",
                confidence: 0.95,
              },
              {
                type: "refactor",
                description: "expose feature flag state",
                details: ["Organize the exported feature flag state."],
                tests: [],
                breakingChanges: [],
                explanation: "A structure-focused alternative.",
                confidence: 0.8,
              },
              {
                type: "test",
                description: "cover feature flag export",
                details: ["Exercise the enabled feature flag export."],
                tests: [],
                breakingChanges: [],
                explanation: "A test-focused alternative.",
                confidence: 0.7,
              },
            ],
          }),
        }),
      );
    });
    servers.push(server);
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("The fake Ollama server did not expose a TCP port.");
    }

    const result = await execa(
      process.execPath,
      [
        "--import",
        tsxLoader,
        cliEntry,
        "suggest",
        "--provider",
        "ollama",
        "--ollama-url",
        `http://127.0.0.1:${address.port}`,
        "--model",
        "integration-model:latest",
        "--json",
      ],
      { cwd: repository },
    );
    const response = JSON.parse(result.stdout) as {
      summary: string;
      splitRecommended: boolean;
      suggestions: unknown[];
    };

    const after = {
      index: await git(repository, ["diff", "--cached", "--binary"]),
      historyCount: await git(repository, ["rev-list", "--count", "--all"]),
    };

    expect(response).toMatchObject({
      summary: "The staged change adds a feature flag.",
      splitRecommended: false,
    });
    expect(response.suggestions).toHaveLength(3);
    expect(after).toEqual(before);
    expect(after.historyCount).toBe("0");
  });
});
