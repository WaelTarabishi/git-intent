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
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
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
  it("supports generate as an alias", async () => {
    const output: string[] = [];

    await createProgram({
      inspectStagedChanges: async () => stagedChanges,
      resolveProvider: () => ({
        id: "ollama",
        analyze: async () => commitAnalysis,
      }),
      writeOutput: (value) => output.push(value),
    }).parseAsync(["node", "git-intent", "generate", "--json"]);

    expect(JSON.parse(output.join(""))).toEqual(commitAnalysis);
  });

  it("uses the selected provider through the provider interface", async () => {
    const analyze = vi.fn<CommitAnalysisProvider["analyze"]>(
      async () => commitAnalysis,
    );
    const provider: CommitAnalysisProvider = { id: "ollama", analyze };
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
      "ollama",
      "--json",
    ]);

    expect(resolveProvider).toHaveBeenCalledWith("ollama");
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
        id: "ollama",
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

  it("prompts for Ollama and one of its installed models", async () => {
    const selections = [
      "ollama",
      "qwen2.5-coder:7b",
      "suggestion:0",
    ];
    const select = vi.fn(async () => selections.shift() ?? "");
    const listModels = vi.fn(async () => [
      "qwen2.5-coder:3b",
      "qwen2.5-coder:7b",
    ]);
    const resolveProvider = vi.fn((): CommitAnalysisProvider => ({
      id: "ollama",
      analyze: async () => commitAnalysis,
    }));

    await createProgram({
      inspectStagedChanges: async () => stagedChanges,
      listProviderModels: listModels,
      resolveProvider,
      select,
      writeOutput: () => undefined,
    }).parseAsync(["node", "git-intent", "generate"]);

    expect(listModels).toHaveBeenCalledWith("ollama", undefined);
    expect(resolveProvider).toHaveBeenCalledWith("ollama", {
      model: "qwen2.5-coder:7b",
    });
    expect(select.mock.calls.map(([options]) => options.message)).toEqual([
      "Select a commit-analysis provider:",
      "Select an installed Ollama model:",
      "Select a commit message:",
    ]);
  });

  it("passes Ollama CLI overrides to provider resolution", async () => {
    const resolveProvider = vi.fn((): CommitAnalysisProvider => ({
      id: "ollama",
      analyze: async () => commitAnalysis,
    }));

    await createProgram({
      inspectStagedChanges: async () => stagedChanges,
      resolveProvider,
      writeOutput: () => undefined,
    }).parseAsync([
      "node",
      "git-intent",
      "suggest",
      "--provider",
      "ollama",
      "--ollama-url",
      "http://127.0.0.1:22434",
      "--model",
      "cli-coder:7b",
      "--ollama-timeout",
      "45000",
      "--json",
    ]);

    expect(resolveProvider).toHaveBeenCalledWith("ollama", {
      baseUrl: "http://127.0.0.1:22434",
      model: "cli-coder:7b",
      timeoutMs: 45_000,
    });
  });

  it("does not print Ollama progress or prompt in JSON mode", async () => {
    const output: string[] = [];
    const select = vi.fn(async () => {
      throw new Error("select must not be called");
    });

    await createProgram({
      inspectStagedChanges: async () => stagedChanges,
      resolveProvider: () => ({
        id: "ollama",
        progressMessage: "Analyzing staged changes with Ollama...",
        analyze: async () => commitAnalysis,
      }),
      select,
      writeOutput: (value) => output.push(value),
    }).parseAsync([
      "node",
      "git-intent",
      "suggest",
      "--provider",
      "ollama",
      "--json",
    ]);

    expect(JSON.parse(output.join(""))).toEqual(commitAnalysis);
    expect(output.join("")).not.toContain("Analyzing staged changes");
    expect(select).not.toHaveBeenCalled();
  });

  it("prints provider progress before interactive Ollama analysis", async () => {
    const output: string[] = [];

    await createProgram({
      inspectStagedChanges: async () => stagedChanges,
      resolveProvider: () => ({
        id: "ollama",
        progressMessage: "Analyzing staged changes with Ollama...",
        analyze: async () => commitAnalysis,
      }),
      select: async () => "suggestion:0",
      writeOutput: (value) => output.push(value),
    }).parseAsync([
      "node",
      "git-intent",
      "suggest",
      "--provider",
      "ollama",
      "--model",
      "test-coder:7b",
    ]);

    expect(output.join("")).toMatch(
      /^Analyzing staged changes with Ollama\.\.\.\nSummary:/u,
    );
  });

  it("writes sensitive-file warnings to stderr without corrupting Ollama JSON output", async () => {
    vi.stubEnv("GIT_INTENT_OLLAMA_URL", "http://localhost:11434");
    vi.stubEnv("GIT_INTENT_OLLAMA_MODEL", "test-coder:7b");
    vi.stubEnv("GIT_INTENT_OLLAMA_TIMEOUT_MS", "1000");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            response: JSON.stringify(commitAnalysis),
          }),
        ),
      ),
    );
    const output: string[] = [];
    const errors: string[] = [];

    await createProgram({
      inspectStagedChanges: async () => ({
        ...stagedChanges,
        files: [
          {
            path: ".env",
            status: "modified",
            binary: false,
          },
        ],
      }),
      writeOutput: (value) => output.push(value),
      writeError: (value) => errors.push(value),
    }).parseAsync([
      "node",
      "git-intent",
      "suggest",
      "--provider",
      "ollama",
      "--json",
    ]);

    expect(JSON.parse(output.join(""))).toEqual(commitAnalysis);
    expect(errors.join("")).toContain("Warning: Sensitive staged filenames");
  });

  it("lets the developer select a validated suggestion without committing", async () => {
    const output: string[] = [];
    const select = vi.fn(async () => "suggestion:0");

    await createProgram({
      inspectStagedChanges: async () => stagedChanges,
      resolveProvider: () => ({
        id: "ollama",
        analyze: async () => commitAnalysis,
      }),
      select,
      writeOutput: (value) => output.push(value),
    }).parseAsync([
      "node",
      "git-intent",
      "suggest",
      "--provider",
      "ollama",
      "--model",
      "test-coder:7b",
    ]);

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
        id: "ollama",
        analyze: async () => commitAnalysis,
      }),
      select: async () => "custom",
      input: async () => "chore: use a custom message",
      writeOutput: (value) => output.push(value),
    }).parseAsync([
      "node",
      "git-intent",
      "suggest",
      "--provider",
      "ollama",
      "--model",
      "test-coder:7b",
    ]);

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
