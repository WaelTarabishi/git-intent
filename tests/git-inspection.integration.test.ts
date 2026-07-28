import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { execa } from "execa";
import { afterEach, describe, expect, it } from "vitest";

import {
  GitService,
  NotGitRepositoryError,
} from "../src/git/git-service.js";

const temporaryDirectories: string[] = [];

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "smart-commit-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function git(cwd: string, args: readonly string[]): Promise<string> {
  const result = await execa("git", [...args], { cwd });
  return result.stdout;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("GitService integration", () => {
  it("reads only staged changes and leaves repository state unchanged", async () => {
    const repository = await createTemporaryDirectory();
    await git(repository, ["init"]);
    await git(repository, ["config", "user.name", "Smart Commit Test"]);
    await git(repository, ["config", "user.email", "test@example.invalid"]);

    await writeFile(path.join(repository, "original.txt"), "rename me\n");
    await writeFile(path.join(repository, "delete.txt"), "delete me\n");
    await writeFile(path.join(repository, "unstaged.txt"), "baseline\n");
    await git(repository, ["add", "--", "."]);
    await git(repository, ["commit", "-m", "test: baseline"]);

    await git(repository, ["mv", "original.txt", "renamed file.txt"]);
    await rm(path.join(repository, "delete.txt"));
    await writeFile(path.join(repository, "مرحبا.txt"), "unicode path\n");
    await writeFile(
      path.join(repository, "binary.dat"),
      Buffer.from([0, 1, 2, 3]),
    );
    await git(repository, [
      "add",
      "--",
      "delete.txt",
      "renamed file.txt",
      "مرحبا.txt",
      "binary.dat",
    ]);
    await writeFile(path.join(repository, "unstaged.txt"), "not staged\n");

    const before = {
      index: await git(repository, ["diff", "--cached", "--binary"]),
      workingTree: await git(repository, ["diff"]),
      head: await git(repository, ["rev-parse", "HEAD"]),
    };

    const analysis = await new GitService(repository).inspectStagedChanges();

    const after = {
      index: await git(repository, ["diff", "--cached", "--binary"]),
      workingTree: await git(repository, ["diff"]),
      head: await git(repository, ["rev-parse", "HEAD"]),
    };

    expect(after).toEqual(before);
    expect(analysis.diff).toBe(before.index);
    expect(analysis.recentCommitMessages).toContain("test: baseline");
    expect(analysis.files.map((file) => file.path)).not.toContain(
      "unstaged.txt",
    );
    expect(analysis.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "renamed file.txt",
          previousPath: "original.txt",
          status: "renamed",
        }),
        expect.objectContaining({
          path: "delete.txt",
          status: "deleted",
        }),
        expect.objectContaining({
          path: "مرحبا.txt",
          status: "added",
        }),
        expect.objectContaining({
          path: "binary.dat",
          status: "added",
          binary: true,
        }),
      ]),
    );
  });

  it("reports a non-repository directory clearly", async () => {
    const directory = await createTemporaryDirectory();

    await expect(
      new GitService(directory).inspectStagedChanges(),
    ).rejects.toBeInstanceOf(NotGitRepositoryError);
  });

  it("creates a local commit and pushes a new branch to a selected remote", async () => {
    const repository = await createTemporaryDirectory();
    const remote = await createTemporaryDirectory();
    await git(remote, ["init", "--bare"]);
    await git(repository, ["init", "-b", "main"]);
    await git(repository, ["config", "user.name", "Git Intent Test"]);
    await git(repository, ["config", "user.email", "test@example.invalid"]);
    await git(repository, ["remote", "add", "origin", remote]);
    await writeFile(path.join(repository, "feature.txt"), "new feature\n");
    await git(repository, ["add", "--", "feature.txt"]);

    const service = new GitService(repository);
    const message = [
      "feat: add feature",
      "",
      "- Add the staged feature implementation.",
    ].join("\n");
    const hash = await service.createCommit(message);
    const context = await service.getPushContext();

    expect(context).toEqual({
      branch: "main",
      remotes: ["origin"],
    });

    await service.pushCurrentBranch(context, "origin");

    expect(await git(repository, ["diff", "--cached"])).toBe("");
    expect(
      (await git(repository, ["log", "-1", "--pretty=%B"])).trimEnd(),
    ).toBe(message);
    expect(await git(remote, ["rev-parse", "refs/heads/main"])).toBe(
      await git(repository, ["rev-parse", "HEAD"]),
    );
    expect(hash).toBe(
      await git(repository, ["rev-parse", "--short", "HEAD"]),
    );
  }, 10_000);
});
