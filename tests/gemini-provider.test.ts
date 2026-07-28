import { describe, expect, it, vi } from "vitest";

import type { ValidatedStagedChangeAnalysis } from "../src/analysis/analysis-schema.js";
import {
  GeminiAuthenticationError,
  GeminiDiffTooLargeError,
  GeminiEmptyResponseError,
  GeminiInvalidJsonError,
  GeminiRateLimitError,
  GeminiSchemaValidationError,
  GeminiTimeoutError,
  GeminiUnavailableError,
} from "../src/providers/gemini-errors.js";
import {
  GeminiProvider,
  type GeminiHttpClient,
} from "../src/providers/gemini-provider.js";

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
  summary: "The staged changes add Gemini support.",
  splitRecommended: false,
  recommendedSuggestionIndex: 0,
  suggestions: [
    {
      type: "feat",
      scope: "providers",
      description: "add Gemini commit analysis",
      details: ["Send staged changes to Gemini for structured analysis."],
      tests: [],
      breakingChanges: [],
      explanation: "The staged diff adds a Gemini provider.",
      confidence: 0.95,
    },
  ],
};

function geminiResponse(text: string, init?: ResponseInit): Response {
  return new Response(
    JSON.stringify({
      candidates: [
        {
          content: {
            role: "model",
            parts: [{ text }],
          },
          finishReason: "STOP",
        },
      ],
    }),
    init,
  );
}

describe("GeminiProvider", () => {
  it("authenticates in a header and returns validated structured analysis", async () => {
    const httpClient = vi.fn<GeminiHttpClient>(async () =>
      geminiResponse(JSON.stringify(validCommitAnalysis)),
    );
    const provider = new GeminiProvider({
      apiKey: "secret-test-key",
      baseUrl: "https://example.test/v1beta/",
      model: "gemini-test",
      httpClient,
      environment: {},
    });

    await expect(provider.analyze({ stagedChanges })).resolves.toEqual(
      validCommitAnalysis,
    );

    const [url, init] = httpClient.mock.calls[0] ?? [];
    expect(url).toBe(
      "https://example.test/v1beta/models/gemini-test:generateContent",
    );
    expect(String(url)).not.toContain("secret-test-key");
    expect(new Headers(init?.headers).get("x-goog-api-key")).toBe(
      "secret-test-key",
    );

    const body = JSON.parse(String(init?.body)) as {
      contents: Array<{ parts: Array<{ text: string }> }>;
      generationConfig: {
        responseMimeType: string;
        responseJsonSchema: Record<string, unknown>;
      };
      systemInstruction: { parts: Array<{ text: string }> };
    };
    expect(body.contents[0]?.parts[0]?.text).toContain(stagedChanges.diff);
    expect(body.systemInstruction.parts[0]?.text).toContain(
      "You analyze Git diffs",
    );
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.responseJsonSchema).not.toHaveProperty(
      "$schema",
    );
    expect(
      JSON.stringify(body.generationConfig.responseJsonSchema),
    ).not.toContain("maxLength");
  });

  it("joins text returned in multiple response parts", async () => {
    const serialized = JSON.stringify(validCommitAnalysis);
    const provider = new GeminiProvider({
      apiKey: "test-key",
      httpClient: async () =>
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    { text: serialized.slice(0, 20) },
                    { text: serialized.slice(20) },
                  ],
                },
              },
            ],
          }),
        ),
      environment: {},
    });

    await expect(provider.analyze({ stagedChanges })).resolves.toEqual(
      validCommitAnalysis,
    );
  });

  it("rejects empty, invalid JSON, and schema-invalid responses", async () => {
    const emptyProvider = new GeminiProvider({
      apiKey: "test-key",
      httpClient: async () =>
        new Response(JSON.stringify({ candidates: [] })),
      environment: {},
    });
    const invalidJsonProvider = new GeminiProvider({
      apiKey: "test-key",
      httpClient: async () => geminiResponse("not JSON"),
      environment: {},
    });
    const invalidSchemaProvider = new GeminiProvider({
      apiKey: "test-key",
      httpClient: async () =>
        geminiResponse(JSON.stringify({ summary: "missing fields" })),
      environment: {},
    });

    await expect(
      emptyProvider.analyze({ stagedChanges }),
    ).rejects.toBeInstanceOf(GeminiEmptyResponseError);
    await expect(
      invalidJsonProvider.analyze({ stagedChanges }),
    ).rejects.toBeInstanceOf(GeminiInvalidJsonError);
    await expect(
      invalidSchemaProvider.analyze({ stagedChanges }),
    ).rejects.toBeInstanceOf(GeminiSchemaValidationError);
  });

  it("maps authentication and rate-limit failures without reflecting response bodies", async () => {
    const authenticationProvider = new GeminiProvider({
      apiKey: "test-key",
      httpClient: async () =>
        new Response("response contains secret-test-key", { status: 403 }),
      environment: {},
    });
    const rateLimitProvider = new GeminiProvider({
      apiKey: "test-key",
      httpClient: async () => new Response("quota detail", { status: 429 }),
      environment: {},
    });

    await expect(
      authenticationProvider.analyze({ stagedChanges }),
    ).rejects.toBeInstanceOf(GeminiAuthenticationError);
    await expect(
      authenticationProvider.analyze({ stagedChanges }),
    ).rejects.not.toThrow("secret-test-key");
    await expect(
      rateLimitProvider.analyze({ stagedChanges }),
    ).rejects.toBeInstanceOf(GeminiRateLimitError);
  });

  it("maps network failures and timeouts", async () => {
    const unavailableProvider = new GeminiProvider({
      apiKey: "test-key",
      httpClient: async () => {
        throw new TypeError("fetch failed");
      },
      environment: {},
    });
    const timeoutClient: GeminiHttpClient = async (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      });
    const timeoutProvider = new GeminiProvider({
      apiKey: "test-key",
      timeoutMs: 5,
      httpClient: timeoutClient,
      environment: {},
    });

    await expect(
      unavailableProvider.analyze({ stagedChanges }),
    ).rejects.toBeInstanceOf(GeminiUnavailableError);
    await expect(
      timeoutProvider.analyze({ stagedChanges }),
    ).rejects.toBeInstanceOf(GeminiTimeoutError);
  });

  it("rejects oversized diffs before sending data", async () => {
    const httpClient = vi.fn<GeminiHttpClient>();
    const provider = new GeminiProvider({
      apiKey: "test-key",
      maxDiffCharacters: 10,
      httpClient,
      environment: {},
    });

    await expect(provider.analyze({ stagedChanges })).rejects.toBeInstanceOf(
      GeminiDiffTooLargeError,
    );
    expect(httpClient).not.toHaveBeenCalled();
  });

  it("warns that staged content is sent to the cloud and flags sensitive files", async () => {
    const onWarning = vi.fn();
    const provider = new GeminiProvider({
      apiKey: "test-key",
      httpClient: async () =>
        geminiResponse(JSON.stringify(validCommitAnalysis)),
      onWarning,
      environment: {},
    });

    await provider.analyze({
      stagedChanges: {
        ...stagedChanges,
        files: [{ path: ".env", status: "modified", binary: false }],
      },
    });

    expect(onWarning.mock.calls.map(([message]) => message).join("\n")).toMatch(
      /cloud provider[\s\S]*Sensitive staged filenames/u,
    );
  });
});
