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
  resolveOllamaConfiguration,
  type OllamaConfiguration,
  type OllamaConfigurationOverrides,
  type OllamaEnvironment,
} from "./ollama-config.js";
import type { OllamaHttpClient } from "./ollama-http-client.js";
import {
  OllamaDiffTooLargeError,
  OllamaEmptyResponseError,
  OllamaHttpError,
  OllamaInvalidJsonError,
  OllamaModelUnavailableError,
  OllamaSchemaValidationError,
  OllamaTimeoutError,
  OllamaUnavailableError,
} from "./ollama-errors.js";

export type { OllamaHttpClient } from "./ollama-http-client.js";

export interface OllamaProviderOptions extends OllamaConfigurationOverrides {
  environment?: OllamaEnvironment;
  httpClient?: OllamaHttpClient;
  onWarning?: (message: string) => void;
}

interface OllamaGenerateEnvelope {
  response: string;
}

function responseErrorDetail(responseBody: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(responseBody);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "error" in parsed &&
      typeof parsed.error === "string"
    ) {
      return parsed.error.slice(0, 500);
    }
  } catch {
    // Non-JSON error bodies are deliberately not reflected verbatim.
  }
  return undefined;
}

function parseEnvelope(responseBody: string): OllamaGenerateEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(responseBody);
  } catch {
    throw new OllamaInvalidJsonError();
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("response" in parsed) ||
    typeof parsed.response !== "string"
  ) {
    throw new OllamaInvalidJsonError();
  }

  return { response: parsed.response };
}

function parseCommitAnalysis(response: string): CommitAnalysis {
  if (response.trim().length === 0) {
    throw new OllamaEmptyResponseError();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(response);
  } catch {
    throw new OllamaInvalidJsonError();
  }

  try {
    return validateCommitAnalysis(parsed);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new OllamaSchemaValidationError();
    }
    throw error;
  }
}

export class OllamaProvider implements CommitAnalysisProvider {
  readonly id = "ollama";
  readonly progressMessage = "Analyzing staged changes with Ollama...";

  private readonly configuration: OllamaConfiguration;
  private readonly httpClient: OllamaHttpClient;
  private readonly onWarning: (message: string) => void;

  constructor(options: OllamaProviderOptions = {}) {
    this.configuration = resolveOllamaConfiguration(
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
      throw new OllamaDiffTooLargeError(
        stagedChanges.diff.length,
        this.configuration.maxDiffCharacters,
      );
    }

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
        `${this.configuration.baseUrl}/api/generate`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model: this.configuration.model,
            system: prompt.system,
            prompt: prompt.prompt,
            format: prompt.format,
            stream: false,
          }),
          signal: controller.signal,
          redirect: "error",
        },
      );
      responseBody = await response.text();
    } catch (error) {
      if (controller.signal.aborted) {
        throw new OllamaTimeoutError(this.configuration.timeoutMs);
      }
      throw new OllamaUnavailableError(error);
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const detail = responseErrorDetail(responseBody);
      const missingModel =
        detail?.toLowerCase().includes("model") === true &&
        detail.toLowerCase().includes("not found");
      if (
        response.status === 404 ||
        missingModel
      ) {
        throw new OllamaModelUnavailableError(this.configuration.model);
      }
      throw new OllamaHttpError(response.status, detail);
    }

    return parseCommitAnalysis(parseEnvelope(responseBody).response);
  }
}
