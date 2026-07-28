import {
  DEFAULT_OLLAMA_MODEL,
  resolveOllamaConfiguration,
  validateLocalModelName,
  type OllamaConfigurationOverrides,
  type OllamaEnvironment,
} from "./ollama-config.js";
import {
  OllamaHttpError,
  OllamaInvalidModelListError,
  OllamaNoModelsError,
  OllamaTimeoutError,
  OllamaUnavailableError,
} from "./ollama-errors.js";
import type { OllamaHttpClient } from "./ollama-http-client.js";

export interface OllamaModelListOptions
  extends Pick<
    OllamaConfigurationOverrides,
    "baseUrl" | "timeoutMs"
  > {
  environment?: OllamaEnvironment;
  httpClient?: OllamaHttpClient;
}

function errorDetail(responseBody: string): string | undefined {
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
    // Do not reflect arbitrary non-JSON response bodies.
  }
  return undefined;
}

function parseModelNames(responseBody: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(responseBody);
  } catch {
    throw new OllamaInvalidModelListError();
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("models" in parsed) ||
    !Array.isArray(parsed.models)
  ) {
    throw new OllamaInvalidModelListError();
  }

  const names: string[] = [];
  for (const model of parsed.models) {
    if (
      typeof model !== "object" ||
      model === null ||
      !("name" in model) ||
      typeof model.name !== "string" ||
      model.name.trim().length === 0
    ) {
      throw new OllamaInvalidModelListError();
    }
    try {
      names.push(validateLocalModelName(model.name.trim()));
    } catch {
      // Cloud-backed aliases may appear in /api/tags but are not local models.
    }
  }

  return [...new Set(names)].sort((left, right) =>
    left.localeCompare(right),
  );
}

export async function listInstalledOllamaModels(
  options: OllamaModelListOptions = {},
): Promise<readonly string[]> {
  const configuration = resolveOllamaConfiguration(
    { ...options, model: DEFAULT_OLLAMA_MODEL },
    options.environment,
  );
  const httpClient = options.httpClient ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    configuration.timeoutMs,
  );

  let response: Response;
  let responseBody: string;
  try {
    response = await httpClient(`${configuration.baseUrl}/api/tags`, {
      method: "GET",
      signal: controller.signal,
      redirect: "error",
    });
    responseBody = await response.text();
  } catch (error) {
    if (controller.signal.aborted) {
      throw new OllamaTimeoutError(configuration.timeoutMs);
    }
    throw new OllamaUnavailableError(error);
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new OllamaHttpError(
      response.status,
      errorDetail(responseBody),
    );
  }

  const models = parseModelNames(responseBody);
  if (models.length === 0) {
    throw new OllamaNoModelsError();
  }
  return models;
}
