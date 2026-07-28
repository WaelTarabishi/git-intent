import { describe, expect, it, vi } from "vitest";

import type { ValidatedStagedChangeAnalysis } from "../src/analysis/analysis-schema.js";
import {
  OllamaDiffTooLargeError,
  OllamaEmptyResponseError,
  OllamaInvalidJsonError,
  OllamaModelUnavailableError,
  OllamaSchemaValidationError,
  OllamaTimeoutError,
  OllamaUnavailableError,
} from "../src/providers/ollama-errors.js";
import {
  OllamaProvider,
  type OllamaHttpClient,
} from "../src/providers/ollama-provider.js";

const stagedChanges: ValidatedStagedChangeAnalysis = {
  repositoryRoot: "C:/repo",
  files: [
    {
      path: "src/cli.ts",
      status: "modified",
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
  recentCommitMessages: ["feat: establish provider interface"],
};

const validCommitAnalysis = {
  summary: "The staged changes update the CLI provider flow.",
  splitRecommended: false,
  recommendedSuggestionIndex: 0,
  suggestions: [
    {
      type: "feat",
      scope: "cli",
      description: "add local commit analysis",
      details: ["Analyze staged changes through a local Ollama model."],
      tests: [],
      breakingChanges: [],
      explanation: "The staged diff adds local provider behavior.",
      confidence: 0.91,
    },
  ],
};

function ollamaResponse(
  modelResponse: string,
  init?: ResponseInit,
): Response {
  return new Response(
    JSON.stringify({
      model: "qwen2.5-coder:7b",
      response: modelResponse,
      done: true,
    }),
    init,
  );
}

describe("OllamaProvider", () => {
  it("uses the configured request URL and model and returns validated analysis", async () => {
    const httpClient = vi.fn<OllamaHttpClient>(async () =>
      ollamaResponse(JSON.stringify(validCommitAnalysis)),
    );
    const provider = new OllamaProvider({
      baseUrl: "http://127.0.0.1:33445/",
      model: "test-coder:7b",
      httpClient,
      environment: {},
    });

    await expect(provider.analyze({ stagedChanges })).resolves.toEqual(
      validCommitAnalysis,
    );

    expect(httpClient).toHaveBeenCalledOnce();
    const [url, init] = httpClient.mock.calls[0] ?? [];
    expect(url).toBe("http://127.0.0.1:33445/api/generate");
    const body = JSON.parse(String(init?.body)) as {
      model: string;
      stream: boolean;
      format: unknown;
      prompt: string;
    };
    expect(body).toMatchObject({
      model: "test-coder:7b",
      stream: false,
    });
    expect(body.format).toBeTypeOf("object");
    expect(body.prompt).toContain(stagedChanges.diff);
  });

  it("rejects invalid JSON returned by the model", async () => {
    const provider = new OllamaProvider({
      httpClient: async () => ollamaResponse("not JSON"),
      environment: {},
    });

    await expect(provider.analyze({ stagedChanges })).rejects.toBeInstanceOf(
      OllamaInvalidJsonError,
    );
  });

  it("rejects schema-invalid JSON returned by the model", async () => {
    const provider = new OllamaProvider({
      httpClient: async () =>
        ollamaResponse(JSON.stringify({ summary: "missing fields" })),
      environment: {},
    });

    await expect(provider.analyze({ stagedChanges })).rejects.toBeInstanceOf(
      OllamaSchemaValidationError,
    );
  });

  it("rejects an empty model response", async () => {
    const provider = new OllamaProvider({
      httpClient: async () => ollamaResponse("  "),
      environment: {},
    });

    await expect(provider.analyze({ stagedChanges })).rejects.toBeInstanceOf(
      OllamaEmptyResponseError,
    );
  });

  it("reports an unreachable Ollama server", async () => {
    const provider = new OllamaProvider({
      httpClient: async () => {
        throw new TypeError("fetch failed");
      },
      environment: {},
    });

    await expect(provider.analyze({ stagedChanges })).rejects.toBeInstanceOf(
      OllamaUnavailableError,
    );
  });

  it("reports when Ollama resets the connection during generation", async () => {
    const provider = new OllamaProvider({
      httpClient: async () => {
        throw new TypeError("fetch failed", {
          cause: Object.assign(new Error("read ECONNRESET"), {
            code: "ECONNRESET",
          }),
        });
      },
      environment: {},
    });

    await expect(provider.analyze({ stagedChanges })).rejects.toThrow(
      /exceeded available RAM, VRAM, or context capacity/u,
    );
  });

  it("reports a request timeout", async () => {
    const httpClient: OllamaHttpClient = async (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      });
    const provider = new OllamaProvider({
      timeoutMs: 5,
      httpClient,
      environment: {},
    });

    await expect(provider.analyze({ stagedChanges })).rejects.toBeInstanceOf(
      OllamaTimeoutError,
    );
  });

  it("reports an unavailable selected model", async () => {
    const provider = new OllamaProvider({
      model: "missing-model",
      httpClient: async () =>
        new Response(
          JSON.stringify({ error: "model 'missing-model' not found" }),
          { status: 404 },
        ),
      environment: {},
    });

    await expect(provider.analyze({ stagedChanges })).rejects.toBeInstanceOf(
      OllamaModelUnavailableError,
    );
  });

  it("rejects an oversized diff before making a request", async () => {
    const httpClient = vi.fn<OllamaHttpClient>();
    const provider = new OllamaProvider({
      maxDiffCharacters: 10,
      httpClient,
      environment: {},
    });

    await expect(provider.analyze({ stagedChanges })).rejects.toBeInstanceOf(
      OllamaDiffTooLargeError,
    );
    expect(httpClient).not.toHaveBeenCalled();
  });

  it("warns about sensitive filenames while still using local analysis", async () => {
    const onWarning = vi.fn();
    const provider = new OllamaProvider({
      httpClient: async () =>
        ollamaResponse(JSON.stringify(validCommitAnalysis)),
      onWarning,
      environment: {},
    });
    const sensitiveChanges: ValidatedStagedChangeAnalysis = {
      ...stagedChanges,
      files: [
        {
          path: ".env.production",
          status: "modified",
          binary: false,
        },
      ],
    };

    await provider.analyze({ stagedChanges: sensitiveChanges });

    expect(onWarning).toHaveBeenCalledOnce();
    expect(onWarning.mock.calls[0]?.[0]).toContain(".env.production");
  });
});
