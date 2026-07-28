import { describe, expect, it, vi } from "vitest";

import {
  DetachedHeadError,
  GitCommandError,
  GitNotInstalledError,
  GitService,
  NoStagedFilesError,
  parseStagedFilenames,
} from "../src/git/git-service.js";
import type { GitCommandRunner } from "../src/git/git-types.js";

describe("parseStagedFilenames", () => {
  it("parses statuses, paths with spaces and Unicode, and renames", () => {
    const output = [
      "A",
      "src/new file.ts",
      "M",
      "docs/مرحبا.md",
      "R100",
      "old-name.ts",
      "new-name.ts",
      "",
    ].join("\0");

    expect(parseStagedFilenames(output)).toEqual([
      {
        path: "src/new file.ts",
        status: "added",
        binary: false,
      },
      {
        path: "docs/مرحبا.md",
        status: "modified",
        binary: false,
      },
      {
        path: "new-name.ts",
        previousPath: "old-name.ts",
        status: "renamed",
        binary: false,
      },
    ]);
  });
});

describe("GitService", () => {
  it("reports when Git is not installed", async () => {
    const missingGitError = Object.assign(new Error("spawn git ENOENT"), {
      code: "ENOENT",
    });
    const runner = vi.fn<GitCommandRunner>().mockRejectedValue(missingGitError);

    await expect(
      new GitService("C:/repo", runner).inspectStagedChanges(),
    ).rejects.toBeInstanceOf(GitNotInstalledError);
  });

  it("wraps an unexpected Git command failure", async () => {
    const runner = vi
      .fn<GitCommandRunner>()
      .mockResolvedValueOnce({ stdout: "git version 2.43.0" })
      .mockRejectedValueOnce({ stderr: "fatal: permission denied" });

    await expect(
      new GitService("C:/repo", runner).inspectStagedChanges(),
    ).rejects.toMatchObject<Partial<GitCommandError>>({
      name: "GitCommandError",
      operation: "checking the repository",
    });
  });

  it("reports an empty staged-file result without touching a real repository", async () => {
    const runner = vi
      .fn<GitCommandRunner>()
      .mockResolvedValueOnce({ stdout: "git version 2.43.0" })
      .mockResolvedValueOnce({ stdout: "true" })
      .mockResolvedValueOnce({ stdout: "C:/repo" })
      .mockResolvedValueOnce({ stdout: "" });

    const service = new GitService("C:/repo", runner);

    await expect(service.inspectStagedChanges()).rejects.toBeInstanceOf(
      NoStagedFilesError,
    );
    expect(runner).toHaveBeenCalledTimes(4);
    expect(runner.mock.calls[3]?.[0]).toEqual([
      "diff",
      "--cached",
      "--name-status",
      "-z",
      "--find-renames",
      "--no-ext-diff",
    ]);
  });

  it("creates a commit with the complete message and returns its short hash", async () => {
    const runner = vi
      .fn<GitCommandRunner>()
      .mockResolvedValueOnce({ stdout: "[main abc1234] commit created" })
      .mockResolvedValueOnce({ stdout: "abc1234" });
    const service = new GitService("C:/repo", runner);
    const message = "feat(cli): add commit workflow\n\n- Create the commit.";

    await expect(service.createCommit(message)).resolves.toBe("abc1234");
    expect(runner.mock.calls.map(([args]) => args)).toEqual([
      ["commit", "--message", message],
      ["rev-parse", "--short", "HEAD"],
    ]);
  });

  it("reads the current branch, upstream, and configured remotes", async () => {
    const runner = vi
      .fn<GitCommandRunner>()
      .mockResolvedValueOnce({ stdout: "main" })
      .mockResolvedValueOnce({ stdout: "origin/main" })
      .mockResolvedValueOnce({ stdout: "origin\nbackup" });

    await expect(
      new GitService("C:/repo", runner).getPushContext(),
    ).resolves.toEqual({
      branch: "main",
      upstream: "origin/main",
      remotes: ["origin", "backup"],
    });
  });

  it("supports a branch without an upstream", async () => {
    const runner = vi
      .fn<GitCommandRunner>()
      .mockResolvedValueOnce({ stdout: "feature/details" })
      .mockRejectedValueOnce({ stderr: "fatal: no upstream configured" })
      .mockResolvedValueOnce({ stdout: "origin" });

    await expect(
      new GitService("C:/repo", runner).getPushContext(),
    ).resolves.toEqual({
      branch: "feature/details",
      remotes: ["origin"],
    });
  });

  it("reports detached HEAD before offering a push", async () => {
    const runner = vi
      .fn<GitCommandRunner>()
      .mockRejectedValueOnce({ stderr: "fatal: ref HEAD is not symbolic" });

    await expect(
      new GitService("C:/repo", runner).getPushContext(),
    ).rejects.toBeInstanceOf(DetachedHeadError);
  });

  it("pushes to an upstream or configures a selected remote", async () => {
    const upstreamRunner = vi
      .fn<GitCommandRunner>()
      .mockResolvedValue({ stdout: "" });
    const upstreamContext = {
      branch: "main",
      upstream: "origin/main",
      remotes: ["origin"],
    };
    await new GitService("C:/repo", upstreamRunner).pushCurrentBranch(
      upstreamContext,
    );
    expect(upstreamRunner).toHaveBeenCalledWith(["push"], "C:/repo");

    const newBranchRunner = vi
      .fn<GitCommandRunner>()
      .mockResolvedValue({ stdout: "" });
    const newBranchContext = {
      branch: "feature/details",
      remotes: ["origin"],
    };
    await new GitService("C:/repo", newBranchRunner).pushCurrentBranch(
      newBranchContext,
      "origin",
    );
    expect(newBranchRunner).toHaveBeenCalledWith(
      [
        "push",
        "--set-upstream",
        "--",
        "origin",
        "feature/details",
      ],
      "C:/repo",
    );
  });
});
