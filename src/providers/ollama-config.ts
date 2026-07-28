export const DEFAULT_OLLAMA_URL = "http://localhost:11434";
export const DEFAULT_OLLAMA_MODEL = "qwen2.5-coder:7b";
export const DEFAULT_OLLAMA_TIMEOUT_MS = 120_000;
export const DEFAULT_MAX_DIFF_CHARACTERS = 100_000;

export interface OllamaConfigurationOverrides {
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  maxDiffCharacters?: number;
}

export interface OllamaConfiguration {
  baseUrl: string;
  model: string;
  timeoutMs: number;
  maxDiffCharacters: number;
}

export type OllamaEnvironment = Readonly<
  Partial<
    Record<
      | "GIT_INTENT_OLLAMA_URL"
      | "GIT_INTENT_OLLAMA_MODEL"
      | "GIT_INTENT_OLLAMA_TIMEOUT_MS",
      string | undefined
    >
  >
>;

function nonEmptyValue(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized === undefined || normalized.length === 0
    ? undefined
    : normalized;
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return value;
}

function timeoutFromEnvironment(value: string | undefined): number | undefined {
  const normalized = nonEmptyValue(value);
  if (normalized === undefined) {
    return undefined;
  }

  const parsed = Number(normalized);
  return positiveInteger(parsed, "GIT_INTENT_OLLAMA_TIMEOUT_MS");
}

function normalizeBaseUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(
      "The Ollama URL must be a valid http:// or https:// base URL.",
    );
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("The Ollama URL must use http:// or https://.");
  }
  if (parsed.username.length > 0 || parsed.password.length > 0) {
    throw new Error("The Ollama URL must not contain credentials.");
  }
  if (parsed.search.length > 0 || parsed.hash.length > 0) {
    throw new Error("The Ollama URL must not contain a query or fragment.");
  }
  if (
    parsed.hostname.toLowerCase() === "ollama.com" ||
    parsed.hostname.toLowerCase().endsWith(".ollama.com")
  ) {
    throw new Error(
      "Direct Ollama cloud endpoints are not supported. Configure a local Ollama server.",
    );
  }

  return parsed.toString().replace(/\/+$/u, "");
}

export function validateLocalModelName(value: string): string {
  if (/(?:^|[:_-])cloud(?:$|[:_-])/iu.test(value)) {
    throw new Error(
      "Ollama cloud models are not supported. Choose a locally installed model.",
    );
  }
  return value;
}

export function resolveOllamaConfiguration(
  overrides: OllamaConfigurationOverrides = {},
  environment: OllamaEnvironment = process.env,
): OllamaConfiguration {
  const baseUrl =
    nonEmptyValue(overrides.baseUrl) ??
    nonEmptyValue(environment.GIT_INTENT_OLLAMA_URL) ??
    DEFAULT_OLLAMA_URL;
  const model =
    nonEmptyValue(overrides.model) ??
    nonEmptyValue(environment.GIT_INTENT_OLLAMA_MODEL) ??
    DEFAULT_OLLAMA_MODEL;
  const timeoutMs =
    overrides.timeoutMs ??
    timeoutFromEnvironment(environment.GIT_INTENT_OLLAMA_TIMEOUT_MS) ??
    DEFAULT_OLLAMA_TIMEOUT_MS;
  const maxDiffCharacters =
    overrides.maxDiffCharacters ?? DEFAULT_MAX_DIFF_CHARACTERS;

  return {
    baseUrl: normalizeBaseUrl(baseUrl),
    model: validateLocalModelName(model),
    timeoutMs: positiveInteger(timeoutMs, "Ollama request timeout"),
    maxDiffCharacters: positiveInteger(
      maxDiffCharacters,
      "Maximum diff character limit",
    ),
  };
}
