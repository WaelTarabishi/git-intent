import { execa } from "execa";

import type {
  GitCommandRunner,
  GitPushContext,
  StagedChangeAnalysis,
  StagedFile,
  StagedFileStatus,
} from "./git-types.js";

interface NumstatEntry {
  path: string;
  additions: number | null;
  deletions: number | null;
}

export class GitNotInstalledError extends Error {
  constructor() {
    super("Git is not installed or is not available on PATH.");
    this.name = "GitNotInstalledError";
  }
}

export class NotGitRepositoryError extends Error {
  constructor() {
    super(
      "Not inside a Git repository. Run this command from a Git working tree.",
    );
    this.name = "NotGitRepositoryError";
  }
}

export class NoStagedFilesError extends Error {
  constructor() {
    super("No staged files found. Stage changes with `git add` and try again.");
    this.name = "NoStagedFilesError";
  }
}

export class DetachedHeadError extends Error {
  constructor() {
    super(
      "The commit was created locally, but HEAD is detached. Check out a branch before pushing.",
    );
    this.name = "DetachedHeadError";
  }
}

export class GitCommandError extends Error {
  constructor(
    public readonly operation: string,
    detail?: string,
  ) {
    super(
      `Git command failed while ${operation}${
        detail ? `: ${detail.trim()}` : "."
      }`,
    );
    this.name = "GitCommandError";
  }
}

export const runGitCommand: GitCommandRunner = async (args, cwd) => {
  const result = await execa("git", [...args], {
    cwd,
    env: { GIT_OPTIONAL_LOCKS: "0" },
    reject: true,
  });

  return {
    stdout: result.stdout,
    stderr: result.stderr,
  };
};

function statusFromCode(code: string): StagedFileStatus {
  const statusCode = code.charAt(0);

  switch (statusCode) {
    case "A":
      return "added";
    case "M":
      return "modified";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    case "C":
      return "copied";
    case "T":
      return "type-changed";
    case "U":
      return "unmerged";
    default:
      return "unknown";
  }
}

export function parseStagedFilenames(output: string): StagedFile[] {
  if (output.length === 0) {
    return [];
  }

  const tokens = output.split("\0");
  if (tokens.at(-1) === "") {
    tokens.pop();
  }

  const files: StagedFile[] = [];
  let index = 0;

  while (index < tokens.length) {
    const header = tokens[index++];
    if (header === undefined || header === "") {
      continue;
    }

    const separatorIndex = header.indexOf("\t");
    const statusToken =
      separatorIndex === -1 ? header : header.slice(0, separatorIndex);
    const inlinePath =
      separatorIndex === -1 ? undefined : header.slice(separatorIndex + 1);
    const firstPath = inlinePath ?? tokens[index++];

    if (firstPath === undefined || firstPath === "") {
      throw new GitCommandError("parsing staged filenames", "missing file path");
    }

    const status = statusFromCode(statusToken);
    if (status === "renamed" || status === "copied") {
      const destinationPath = tokens[index++];
      if (destinationPath === undefined || destinationPath === "") {
        throw new GitCommandError(
          "parsing staged filenames",
          "missing destination path",
        );
      }

      files.push({
        path: destinationPath,
        previousPath: firstPath,
        status,
        binary: false,
      });
    } else {
      files.push({
        path: firstPath,
        status,
        binary: false,
      });
    }
  }

  return files;
}

function splitNumstatHeader(header: string): {
  additions: string;
  deletions: string;
  path: string;
} {
  const firstTab = header.indexOf("\t");
  const secondTab = header.indexOf("\t", firstTab + 1);

  if (firstTab === -1 || secondTab === -1) {
    throw new GitCommandError(
      "parsing staged statistics",
      "unexpected numstat output",
    );
  }

  return {
    additions: header.slice(0, firstTab),
    deletions: header.slice(firstTab + 1, secondTab),
    path: header.slice(secondTab + 1),
  };
}

export function parseNumstat(output: string): NumstatEntry[] {
  if (output.length === 0) {
    return [];
  }

  const tokens = output.split("\0");
  if (tokens.at(-1) === "") {
    tokens.pop();
  }

  const entries: NumstatEntry[] = [];
  let index = 0;

  while (index < tokens.length) {
    const header = tokens[index++];
    if (header === undefined || header === "") {
      continue;
    }

    const parsed = splitNumstatHeader(header);
    let path = parsed.path;

    if (path === "") {
      const previousPath = tokens[index++];
      const destinationPath = tokens[index++];
      if (previousPath === undefined || destinationPath === undefined) {
        throw new GitCommandError(
          "parsing staged statistics",
          "incomplete renamed path",
        );
      }
      path = destinationPath;
    }

    const isBinary = parsed.additions === "-" || parsed.deletions === "-";
    entries.push({
      path,
      additions: isBinary ? null : Number.parseInt(parsed.additions, 10),
      deletions: isBinary ? null : Number.parseInt(parsed.deletions, 10),
    });
  }

  return entries;
}

function errorDetail(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  const candidate = error as {
    stderr?: unknown;
    shortMessage?: unknown;
    message?: unknown;
  };

  if (typeof candidate.stderr === "string" && candidate.stderr.length > 0) {
    return candidate.stderr;
  }
  if (
    typeof candidate.shortMessage === "string" &&
    candidate.shortMessage.length > 0
  ) {
    return candidate.shortMessage;
  }
  return typeof candidate.message === "string" ? candidate.message : undefined;
}

function isMissingExecutableError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const candidate = error as {
    code?: unknown;
    cause?: { code?: unknown };
  };
  return candidate.code === "ENOENT" || candidate.cause?.code === "ENOENT";
}

export class GitService {
  constructor(
    private readonly cwd = process.cwd(),
    private readonly runner: GitCommandRunner = runGitCommand,
  ) {}

  private async execute(
    args: readonly string[],
    operation: string,
  ): Promise<string> {
    try {
      const result = await this.runner(args, this.cwd);
      return result.stdout;
    } catch (error) {
      if (isMissingExecutableError(error)) {
        throw new GitNotInstalledError();
      }
      throw new GitCommandError(operation, errorDetail(error));
    }
  }

  private async readRecentCommitMessages(): Promise<string[]> {
    try {
      const output = await this.execute(
        ["log", "-5", "--pretty=format:%s"],
        "reading recent commit messages",
      );
      return output
        .split(/\r?\n/u)
        .map((message) => message.trim())
        .filter(
          (message) =>
            message.length > 0 &&
            message.length <= 500 &&
            !/[\u0000-\u001f\u007f]/u.test(message),
        );
    } catch {
      // A new repository has no HEAD, and history is optional model context.
      return [];
    }
  }

  async inspectStagedChanges(): Promise<StagedChangeAnalysis> {
    await this.execute(["--version"], "checking whether Git is installed");

    let isInsideWorkTree: string;
    try {
      isInsideWorkTree = await this.execute(
        ["rev-parse", "--is-inside-work-tree"],
        "checking the repository",
      );
    } catch (error) {
      if (
        error instanceof GitCommandError &&
        error.message.toLowerCase().includes("not a git repository")
      ) {
        throw new NotGitRepositoryError();
      }
      throw error;
    }

    if (isInsideWorkTree.trim() !== "true") {
      throw new NotGitRepositoryError();
    }

    const repositoryRoot = (
      await this.execute(
        ["rev-parse", "--show-toplevel"],
        "finding the repository root",
      )
    ).trim();

    const nameStatusOutput = await this.execute(
      [
        "diff",
        "--cached",
        "--name-status",
        "-z",
        "--find-renames",
        "--no-ext-diff",
      ],
      "reading staged filenames",
    );
    const files = parseStagedFilenames(nameStatusOutput);

    if (files.length === 0) {
      throw new NoStagedFilesError();
    }

    const [diff, numstatOutput, recentCommitMessages] = await Promise.all([
      this.execute(
        ["diff", "--cached", "--no-color", "--no-ext-diff", "--binary"],
        "reading the staged diff",
      ),
      this.execute(
        ["diff", "--cached", "--numstat", "-z", "--find-renames", "--no-ext-diff"],
        "reading staged statistics",
      ),
      this.readRecentCommitMessages(),
    ]);

    const numstat = parseNumstat(numstatOutput);
    const binaryPaths = new Set(
      numstat
        .filter((entry) => entry.additions === null || entry.deletions === null)
        .map((entry) => entry.path),
    );
    const filesWithBinaryState = files.map((file) => ({
      ...file,
      binary: binaryPaths.has(file.path),
    }));

    const analysis: StagedChangeAnalysis = {
      repositoryRoot,
      files: filesWithBinaryState,
      statistics: {
        filesChanged: filesWithBinaryState.length,
        insertions: numstat.reduce(
          (total, entry) => total + (entry.additions ?? 0),
          0,
        ),
        deletions: numstat.reduce(
          (total, entry) => total + (entry.deletions ?? 0),
          0,
        ),
        binaryFiles: binaryPaths.size,
      },
      diff,
    };

    if (recentCommitMessages.length > 0) {
      analysis.recentCommitMessages = recentCommitMessages;
    }

    return analysis;
  }

  async createCommit(message: string): Promise<string> {
    const normalizedMessage = message.trim();
    if (normalizedMessage.length === 0) {
      throw new Error("Commit message cannot be empty.");
    }
    if (normalizedMessage.includes("\0")) {
      throw new Error("Commit message cannot contain a null character.");
    }

    await this.execute(
      ["commit", "--message", normalizedMessage],
      "creating the commit",
    );
    return (
      await this.execute(
        ["rev-parse", "--short", "HEAD"],
        "reading the created commit",
      )
    ).trim();
  }

  async getPushContext(): Promise<GitPushContext> {
    let branch: string;
    try {
      branch = (
        await this.execute(
          ["symbolic-ref", "--quiet", "--short", "HEAD"],
          "reading the current branch",
        )
      ).trim();
    } catch {
      throw new DetachedHeadError();
    }

    let upstream: string | undefined;
    try {
      const value = (
        await this.execute(
          [
            "rev-parse",
            "--abbrev-ref",
            "--symbolic-full-name",
            "@{upstream}",
          ],
          "reading the configured upstream",
        )
      ).trim();
      if (value.length > 0) {
        upstream = value;
      }
    } catch {
      // A branch without an upstream can still be pushed to a chosen remote.
    }

    const remotes = (
      await this.execute(["remote"], "reading configured Git remotes")
    )
      .split(/\r?\n/u)
      .map((remote) => remote.trim())
      .filter((remote) => remote.length > 0);

    return upstream === undefined
      ? { branch, remotes }
      : { branch, upstream, remotes };
  }

  async pushCurrentBranch(
    context: GitPushContext,
    remote?: string,
  ): Promise<void> {
    if (context.upstream !== undefined) {
      await this.execute(["push"], "pushing the commit");
      return;
    }

    if (remote === undefined || !context.remotes.includes(remote)) {
      throw new Error("Select a configured Git remote before pushing.");
    }

    await this.execute(
      ["push", "--set-upstream", "--", remote, context.branch],
      "pushing the commit and configuring its upstream",
    );
  }
}
