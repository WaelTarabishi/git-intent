import { ZodError } from "zod";

import {
  validateCommitAnalysis,
  type CommitAnalysis,
} from "../analysis/commit-analysis-schema.js";
import { buildCommitAnalysisPrompt } from "../prompts/commit-analysis-prompt.js";
import {
  detectSensitiveStagedFiles,
  formatSensitiveFileWarning,
} from "../safety/staged-content-safety.js";
import type {
  CommitAnalysisProvider,
  CommitAnalysisRequest,
} from "./commit-analysis-provider.js";
import {
  resolveGeminiConfiguration,
  type GeminiConfiguration,
  type GeminiConfigurationOverrides,
  type GeminiEnvironment,
} from "./gemini-config.js";
import {
  GeminiAuthenticationError,
  GeminiDiffTooLargeError,
  GeminiEmptyResponseError,
  GeminiHttpError,
  GeminiInvalidJsonError,
  GeminiInvalidResponseError,
  GeminiModelUnavailableError,
  GeminiRateLimitError,
  GeminiSchemaValidationError,
  GeminiTimeoutError,
  GeminiUnavailableError,
} from "./gemini-errors.js";

export type GeminiHttpClient = (
  input: string | URL,
  init?: RequestInit,
  
) => Promise<Response>;

export interface GeminiProviderOptions extends GeminiConfigurationOverrides {
  environment?: GeminiEnvironment;
  httpClient?: GeminiHttpClient;
  onWarning?: (message: string) => void;
}

interface GeminiResponsePart {
  text?: unknown;
}

interface GeminiCandidate {
  content?: {
    parts?: unknown;
  };
}

interface GeminiGenerateResponse {
  candidates: GeminiCandidate[];
}

const unsupportedGeminiSchemaKeywords = new Set([
  "$schema",
  "minLength",
  "maxLength",
  "pattern",
]);

function geminiResponseSchema(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(geminiResponseSchema);
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !unsupportedGeminiSchemaKeywords.has(key))
      .map(([key, entry]) => [key, geminiResponseSchema(entry)]),
  );
}

function parseEnvelope(responseBody: string): GeminiGenerateResponse {
  let parsed: unknown;
  try {
    parsed = JSON.parse(responseBody);
  } catch {
    throw new GeminiInvalidResponseError();
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("candidates" in parsed) ||
    !Array.isArray(parsed.candidates)
  ) {
    throw new GeminiInvalidResponseError();
  }

  return { candidates: parsed.candidates as GeminiCandidate[] };
}

function responseText(response: GeminiGenerateResponse): string {
  const parts = response.candidates[0]?.content?.parts;
  if (!Array.isArray(parts)) {
    throw new GeminiEmptyResponseError();
  }

  const text = (parts as GeminiResponsePart[])
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("");
  if (text.trim().length === 0) {
    throw new GeminiEmptyResponseError();
  }
  return text;
}

function parseCommitAnalysis(response: string): CommitAnalysis {
  let parsed: unknown;
  try {
    parsed = JSON.parse(response);
  } catch {
    throw new GeminiInvalidJsonError();
  }

  try {
    return validateCommitAnalysis(parsed);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new GeminiSchemaValidationError();
    }
    throw error;
  }
}

export class GeminiProvider implements CommitAnalysisProvider {
  readonly id = "gemini";
  readonly progressMessage = "Analyzing staged changes with Gemini...";

  private readonly configuration: GeminiConfiguration;
  private readonly httpClient: GeminiHttpClient;
  private readonly onWarning: (message: string) => void;

  constructor(options: GeminiProviderOptions = {}) {
    this.configuration = resolveGeminiConfiguration(
      options,
      options.environment,
    );
    this.httpClient = options.httpClient ?? fetch;
    this.onWarning = options.onWarning ?? (() => undefined);
  }

  async analyze({
    stagedChanges,
  }: CommitAnalysisRequest): Promise<CommitAnalysis> {
    if (
      stagedChanges.diff.length > this.configuration.maxDiffCharacters
    ) {
      throw new GeminiDiffTooLargeError(
        stagedChanges.diff.length,
        this.configuration.maxDiffCharacters,
      );
    }

    this.onWarning(
      "Gemini is a cloud provider. Changed filenames, recent commit subjects, and the staged diff will be sent to Google.",
    );
    const sensitiveFiles = detectSensitiveStagedFiles(stagedChanges);
    if (sensitiveFiles.length > 0) {
      this.onWarning(formatSensitiveFileWarning(sensitiveFiles));
    }

    const prompt = buildCommitAnalysisPrompt(stagedChanges);
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.configuration.timeoutMs,
    );

    let response: Response;
    let responseBody: string;
    try {
      response = await this.httpClient(
        `${this.configuration.baseUrl}/models/${encodeURIComponent(
          this.configuration.model,
        )}:generateContent`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": this.configuration.apiKey,
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: prompt.system }],
            },
            contents: [
              {
                role: "user",
                parts: [{ text: prompt.prompt }],
              },
            ],
            generationConfig: {
              responseMimeType: "application/json",
              responseJsonSchema: geminiResponseSchema(prompt.format),
            },
          }),
          signal: controller.signal,
          redirect: "error",
        },
      );
      responseBody = await response.text();
    } catch (error) {
      if (controller.signal.aborted) {
        throw new GeminiTimeoutError(this.configuration.timeoutMs);
      }
      throw new GeminiUnavailableError(error);
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new GeminiAuthenticationError();
      }
      if (response.status === 404) {
        throw new GeminiModelUnavailableError(this.configuration.model);
      }
      if (response.status === 429) {
        throw new GeminiRateLimitError();
      }
      throw new GeminiHttpError(response.status);
    }

    return parseCommitAnalysis(responseText(parseEnvelope(responseBody)));
  }
}
