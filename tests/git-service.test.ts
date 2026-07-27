import { describe, expect, it, vi } from "vitest";

import {
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
});
