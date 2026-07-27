import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { execa } from "execa";
import { afterEach, describe, expect, it } from "vitest";

const temporaryDirectories: string[] = [];
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
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("suggest command integration", () => {
  it("returns mock JSON without changing the fixture index or history", async () => {
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

    const result = await execa(
      process.execPath,
      [
        "--import",
        tsxLoader,
        cliEntry,
        "suggest",
        "--provider",
        "mock",
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
      summary: "Staged changes update 1 file with 1 insertion and 0 deletions.",
      splitRecommended: false,
    });
    expect(response.suggestions).toHaveLength(3);
    expect(after).toEqual(before);
    expect(after.historyCount).toBe("0");
  });
});
