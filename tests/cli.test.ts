import { CommanderError } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createProgram } from "../src/cli.js";
import { NoStagedFilesError } from "../src/git/git-service.js";
import type { CommitAnalysisProvider } from "../src/providers/commit-analysis-provider.js";

const stagedChanges = {
  repositoryRoot: "C:/repo",
  files: [
    {
      path: "src/cli.ts",
      status: "modified" as const,
      binary: false,
    },
  ],
  statistics: {
    filesChanged: 1,
    insertions: 12,
    deletions: 3,
    binaryFiles: 0,
  },
  diff: "diff --git a/src/cli.ts b/src/cli.ts",
};

const commitAnalysis = {
  summary: "The staged changes update the CLI.",
  splitRecommended: true,
  splitReason: "The source and documentation updates can stand alone.",
  suggestions: [
    {
      type: "feat" as const,
      scope: "cli",
      description: "add commit suggestions",
      explanation: "The staged diff adds a new user-facing command.",
      confidence: 0.9,
    },
  ],
};

afterEach(() => {
  process.exitCode = undefined;
});

describe("CLI options", () => {
  it("rejects --json and --show-diff when used together", async () => {
    const program = createProgram()
      .exitOverride()
      .configureOutput({
        writeErr: () => undefined,
        writeOut: () => undefined,
      });
    program.commands.forEach((command) => {
      command.exitOverride();
      command.configureOutput({
        writeErr: () => undefined,
        writeOut: () => undefined,
      });
    });

    await expect(
      program.parseAsync([
        "node",
        "smart-commit",
        "inspect",
        "--json",
        "--show-diff",
      ]),
    ).rejects.toMatchObject<Partial<CommanderError>>({
      code: "commander.conflictingOption",
    });
  });
});

describe("suggest command", () => {
  it("uses the selected provider through the provider interface", async () => {
    const analyze = vi.fn<CommitAnalysisProvider["analyze"]>(
      async () => commitAnalysis,
    );
    const provider: CommitAnalysisProvider = { id: "mock", analyze };
    const resolveProvider = vi.fn(() => provider);
    const output: string[] = [];

    await createProgram({
      inspectStagedChanges: async () => stagedChanges,
      resolveProvider,
      writeOutput: (value) => output.push(value),
    }).parseAsync([
      "node",
      "git-intent",
      "suggest",
      "--provider",
      "mock",
      "--json",
    ]);

    expect(resolveProvider).toHaveBeenCalledWith("mock");
    expect(analyze).toHaveBeenCalledWith({ stagedChanges });
    expect(JSON.parse(output.join(""))).toEqual(commitAnalysis);
  });

  it("writes only valid JSON and never invokes prompts in JSON mode", async () => {
    const output: string[] = [];
    const confirm = vi.fn(async () => {
      throw new Error("confirm must not be called");
    });
    const select = vi.fn(async () => {
      throw new Error("select must not be called");
    });
    const input = vi.fn(async () => {
      throw new Error("input must not be called");
    });

    await createProgram({
      inspectStagedChanges: async () => stagedChanges,
      resolveProvider: () => ({
        id: "mock",
        analyze: async () => commitAnalysis,
      }),
      confirm,
      select,
      input,
      writeOutput: (value) => output.push(value),
    }).parseAsync(["node", "git-intent", "suggest", "--json"]);

    expect(() => JSON.parse(output.join(""))).not.toThrow();
    expect(JSON.parse(output.join(""))).toEqual(commitAnalysis);
    expect(confirm).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
    expect(input).not.toHaveBeenCalled();
  });

  it("lets the developer select a validated suggestion without committing", async () => {
    const output: string[] = [];
    const select = vi.fn(async () => "suggestion:0");

    await createProgram({
      inspectStagedChanges: async () => stagedChanges,
      resolveProvider: () => ({
        id: "mock",
        analyze: async () => commitAnalysis,
      }),
      select,
      writeOutput: (value) => output.push(value),
    }).parseAsync(["node", "git-intent", "suggest"]);

    expect(output.join("")).toContain(
      "Warning: Splitting the staged changes is recommended.",
    );
    expect(output.join("")).toContain(
      "Selected commit message:\nfeat(cli): add commit suggestions",
    );
    expect(select).toHaveBeenCalledOnce();
  });

  it("lets the developer enter a custom message", async () => {
    const output: string[] = [];

    await createProgram({
      inspectStagedChanges: async () => stagedChanges,
      resolveProvider: () => ({
        id: "mock",
        analyze: async () => commitAnalysis,
      }),
      select: async () => "custom",
      input: async () => "chore: use a custom message",
      writeOutput: (value) => output.push(value),
    }).parseAsync(["node", "git-intent", "suggest"]);

    expect(output.join("")).toContain(
      "Selected commit message:\nchore: use a custom message",
    );
  });

  it("rejects empty staged changes before resolving a provider", async () => {
    const resolveProvider = vi.fn();
    const output: string[] = [];
    const errors: string[] = [];
    const setExitCode = vi.fn();

    await createProgram({
      inspectStagedChanges: async () => {
        throw new NoStagedFilesError();
      },
      resolveProvider,
      writeOutput: (value) => output.push(value),
      writeError: (value) => errors.push(value),
      setExitCode,
    }).parseAsync(["node", "git-intent", "suggest", "--json"]);

    expect(resolveProvider).not.toHaveBeenCalled();
    expect(output).toEqual([]);
    expect(errors.join("")).toContain("No staged files found.");
    expect(setExitCode).toHaveBeenCalledWith(1);
  });
});
