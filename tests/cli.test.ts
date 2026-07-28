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
  recommendedSuggestionIndex: 0,
  suggestions: [
    {
      type: "feat" as const,
      scope: "cli",
      description: "add commit suggestions",
      details: [
        "Add a provider-backed flow for reviewing commit suggestions.",
      ],
      tests: ["Cover interactive suggestion selection."],
      breakingChanges: [],
      explanation: "The staged diff adds a new user-facing command.",
      confidence: 0.9,
    },
  ],
};

const localCommitDependencies = {
  createCommit: async () => "abc1234",
  getPushContext: async () => ({
    branch: "main",
    remotes: [],
  }),
  pushCurrentBranch: async () => {
    throw new Error("push must not be called without a configured remote");
  },
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
      ...localCommitDependencies,
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
      ...localCommitDependencies,
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
    const createCommit = vi.fn(async () => {
      throw new Error("createCommit must not be called");
    });
    const getPushContext = vi.fn(async () => {
      throw new Error("getPushContext must not be called");
    });
    const pushCurrentBranch = vi.fn(async () => {
      throw new Error("pushCurrentBranch must not be called");
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
      createCommit,
      getPushContext,
      pushCurrentBranch,
      writeOutput: (value) => output.push(value),
    }).parseAsync(["node", "git-intent", "suggest", "--json"]);

    expect(() => JSON.parse(output.join(""))).not.toThrow();
    expect(JSON.parse(output.join(""))).toEqual(commitAnalysis);
    expect(confirm).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
    expect(input).not.toHaveBeenCalled();
    expect(createCommit).not.toHaveBeenCalled();
    expect(getPushContext).not.toHaveBeenCalled();
    expect(pushCurrentBranch).not.toHaveBeenCalled();
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
      ...localCommitDependencies,
      inspectStagedChanges: async () => stagedChanges,
      listProviderModels: listModels,
      resolveProvider,
      select,
      confirm: async () => true,
      writeOutput: () => undefined,
    }).parseAsync(["node", "git-intent", "generate"]);

    expect(listModels).toHaveBeenCalledWith("ollama", undefined);
    expect(resolveProvider).toHaveBeenCalledWith("ollama", {
      model: "qwen2.5-coder:7b",
    });
    expect(select.mock.calls.map(([options]) => options.message)).toEqual([
      "Select a commit-analysis provider:",
      "Select an installed Ollama model:",
      "Choose a commit message to preview:",
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

  it("selects Gemini without loading Ollama models", async () => {
    const selections = ["gemini", "suggestion:0"];
    const select = vi.fn(async () => selections.shift() ?? "");
    const listModels = vi.fn(async () => {
      throw new Error("Gemini must not load Ollama models");
    });
    const resolveProvider = vi.fn((): CommitAnalysisProvider => ({
      id: "gemini",
      analyze: async () => commitAnalysis,
    }));

    await createProgram({
      ...localCommitDependencies,
      inspectStagedChanges: async () => stagedChanges,
      listProviderModels: listModels,
      resolveProvider,
      select,
      confirm: async () => true,
      writeOutput: () => undefined,
    }).parseAsync(["node", "git-intent", "suggest"]);

    expect(listModels).not.toHaveBeenCalled();
    expect(resolveProvider).toHaveBeenCalledWith("gemini");
    expect(select.mock.calls.map(([options]) => options.message)).toEqual([
      "Select a commit-analysis provider:",
      "Choose a commit message to preview:",
    ]);
  });

  it("passes Gemini model and timeout overrides to provider resolution", async () => {
    const resolveProvider = vi.fn((): CommitAnalysisProvider => ({
      id: "gemini",
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
      "gemini",
      "--model",
      "gemini-test",
      "--gemini-timeout",
      "45000",
      "--json",
    ]);

    expect(resolveProvider).toHaveBeenCalledWith("gemini", {
      model: "gemini-test",
      timeoutMs: 45_000,
    });
  });

  it("uses the registered Gemini provider with an environment API key", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [{ text: JSON.stringify(commitAnalysis) }],
                },
              },
            ],
          }),
        ),
      ),
    );
    const output: string[] = [];
    const errors: string[] = [];

    await createProgram({
      inspectStagedChanges: async () => stagedChanges,
      writeOutput: (value) => output.push(value),
      writeError: (value) => errors.push(value),
    }).parseAsync([
      "node",
      "git-intent",
      "suggest",
      "--provider",
      "gemini",
      "--model",
      "gemini-test",
      "--json",
    ]);

    expect(JSON.parse(output.join(""))).toEqual(commitAnalysis);
    expect(errors.join("")).toContain("Gemini is a cloud provider");
    expect(fetch).toHaveBeenCalledOnce();
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
      ...localCommitDependencies,
      inspectStagedChanges: async () => stagedChanges,
      resolveProvider: () => ({
        id: "ollama",
        progressMessage: "Analyzing staged changes with Ollama...",
        analyze: async () => commitAnalysis,
      }),
      select: async () => "suggestion:0",
      confirm: async () => true,
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
      /^◌ Analyzing staged changes with Ollama\.\.\.\n◆ Analysis summary/u,
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

  it("creates a local commit from the selected validated suggestion", async () => {
    const output: string[] = [];
    const select = vi.fn(async () => "suggestion:0");
    const createCommit = vi.fn(async () => "abc1234");

    await createProgram({
      ...localCommitDependencies,
      createCommit,
      inspectStagedChanges: async () => stagedChanges,
      resolveProvider: () => ({
        id: "ollama",
        analyze: async () => commitAnalysis,
      }),
      select,
      confirm: async () => true,
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
      "Splitting the staged changes is recommended.",
    );
    expect(output.join("")).toContain(
      "Created commit abc1234.",
    );
    expect(createCommit).toHaveBeenCalledWith(
      [
        "feat(cli): add commit suggestions",
        "",
        "- Add a provider-backed flow for reviewing commit suggestions.",
        "",
        "Tests:",
        "- Cover interactive suggestion selection.",
      ].join("\n"),
    );
    expect(select).toHaveBeenCalledOnce();
  });

  it("puts the recommendation first and previews only the selected detailed message", async () => {
    const output: string[] = [];
    const threeSuggestions = {
      ...commitAnalysis,
      splitRecommended: false,
      splitReason: undefined,
      recommendedSuggestionIndex: 1,
      suggestions: [
        {
          ...commitAnalysis.suggestions[0],
          type: "refactor" as const,
          description: "restructure commit analysis",
          details: ["Refactor the shared analysis flow."],
          tests: [],
          explanation: "An implementation-focused alternative.",
          confidence: 0.76,
        },
        {
          ...commitAnalysis.suggestions[0],
          description: "improve commit suggestion review",
          details: ["Show a focused preview after compact selection."],
          tests: ["Cover recommended suggestion ordering."],
          explanation: "The best description of the user-facing change.",
          confidence: 0.96,
        },
        {
          ...commitAnalysis.suggestions[0],
          type: "test" as const,
          scope: undefined,
          description: "expand commit suggestion coverage",
          details: ["Exercise detailed suggestion validation."],
          tests: ["Add schema and UI regression coverage."],
          explanation: "A test-focused alternative.",
          confidence: 0.7,
        },
      ],
    };
    const select = vi.fn(async () => "suggestion:1");

    await createProgram({
      ...localCommitDependencies,
      inspectStagedChanges: async () => stagedChanges,
      resolveProvider: () => ({
        id: "ollama",
        analyze: async () => threeSuggestions,
      }),
      select,
      confirm: async () => true,
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

    const choices = select.mock.calls[0]?.[0].choices ?? [];
    expect(choices[0]?.value).toBe("suggestion:1");
    expect(choices[0]?.name).toContain("★ Recommended");
    expect(JSON.stringify(choices)).not.toContain(
      "Show a focused preview after compact selection.",
    );
    expect(output.join("")).toContain("Recommended commit");
    expect(output.join("")).toContain(
      "Show a focused preview after compact selection.",
    );
    expect(output.join("")).not.toContain(
      "Refactor the shared analysis flow.",
    );
  });

  it("lets the developer enter a custom message", async () => {
    const output: string[] = [];
    const createCommit = vi.fn(async () => "def5678");

    await createProgram({
      ...localCommitDependencies,
      createCommit,
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

    expect(createCommit).toHaveBeenCalledWith(
      "chore: use a custom message",
    );
    expect(output.join("")).toContain("Created commit def5678.");
  });

  it("keeps the created commit local when push confirmation is declined", async () => {
    const confirmations = [true, false];
    const confirm = vi.fn(async () => confirmations.shift() ?? false);
    const pushCurrentBranch = vi.fn(async () => undefined);
    const createCommit = vi.fn(async () => "abc1234");
    const output: string[] = [];

    await createProgram({
      inspectStagedChanges: async () => stagedChanges,
      resolveProvider: () => ({
        id: "ollama",
        analyze: async () => commitAnalysis,
      }),
      select: async () => "suggestion:0",
      confirm,
      createCommit,
      getPushContext: async () => ({
        branch: "main",
        upstream: "origin/main",
        remotes: ["origin"],
      }),
      pushCurrentBranch,
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

    expect(createCommit).toHaveBeenCalledOnce();
    expect(pushCurrentBranch).not.toHaveBeenCalled();
    expect(confirm.mock.calls[1]?.[0]).toMatchObject({
      message: "Push abc1234 to origin/main?",
      default: false,
    });
    expect(output.join("")).toContain(
      "Commit kept locally; nothing was pushed.",
    );
  });

  it("pushes the created commit after separate confirmation", async () => {
    const confirmations = [true, true];
    const context = {
      branch: "main",
      upstream: "origin/main",
      remotes: ["origin"],
    };
    const pushCurrentBranch = vi.fn(async () => undefined);
    const output: string[] = [];

    await createProgram({
      inspectStagedChanges: async () => stagedChanges,
      resolveProvider: () => ({
        id: "ollama",
        analyze: async () => commitAnalysis,
      }),
      select: async () => "suggestion:0",
      confirm: async () => confirmations.shift() ?? false,
      createCommit: async () => "abc1234",
      getPushContext: async () => context,
      pushCurrentBranch,
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

    expect(pushCurrentBranch).toHaveBeenCalledWith(context);
    expect(output.join("")).toContain(
      "Pushed abc1234 to origin/main.",
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
