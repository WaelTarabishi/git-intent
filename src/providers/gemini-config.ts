export const DEFAULT_GEMINI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta";
export const DEFAULT_GEMINI_MODEL = "gemini-3.6-flash";
export const DEFAULT_GEMINI_TIMEOUT_MS = 120_000;
export const DEFAULT_GEMINI_MAX_DIFF_CHARACTERS = 100_000;

export interface GeminiConfigurationOverrides {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  maxDiffCharacters?: number;
}

export interface GeminiConfiguration {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
  maxDiffCharacters: number;
}

export type GeminiEnvironment = Readonly<
  Partial<
    Record<
      | "GEMINI_API_KEY"
      | "GOOGLE_API_KEY"
      | "GIT_INTENT_GEMINI_MODEL"
      | "GIT_INTENT_GEMINI_TIMEOUT_MS",
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

  return positiveInteger(
    Number(normalized),
    "GIT_INTENT_GEMINI_TIMEOUT_MS",
  );
}

function normalizeBaseUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("The Gemini base URL must be a valid HTTPS URL.");
  }

  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
    throw new Error("The Gemini base URL must use HTTPS.");
  }
  if (parsed.username.length > 0 || parsed.password.length > 0) {
    throw new Error("The Gemini base URL must not contain credentials.");
  }
  if (parsed.search.length > 0 || parsed.hash.length > 0) {
    throw new Error(
      "The Gemini base URL must not contain a query or fragment.",
    );
  }

  return parsed.toString().replace(/\/+$/u, "");
}

function validateModel(value: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u.test(value)) {
    throw new Error("The Gemini model name is invalid.");
  }
  return value;
}

export function resolveGeminiConfiguration(
  overrides: GeminiConfigurationOverrides = {},
  environment: GeminiEnvironment = process.env,
): GeminiConfiguration {
  const apiKey =
    nonEmptyValue(overrides.apiKey) ??
    nonEmptyValue(environment.GOOGLE_API_KEY) ??
    nonEmptyValue(environment.GEMINI_API_KEY);
  if (apiKey === undefined) {
    throw new Error(
      "Gemini API key is missing. Run `git-intent config set-gemini-key` to save one for all projects, or set GEMINI_API_KEY (or GOOGLE_API_KEY), then try again.",
    );
  }

  const model =
    nonEmptyValue(overrides.model) ??
    nonEmptyValue(environment.GIT_INTENT_GEMINI_MODEL) ??
    DEFAULT_GEMINI_MODEL;
  const timeoutMs =
    overrides.timeoutMs ??
    timeoutFromEnvironment(environment.GIT_INTENT_GEMINI_TIMEOUT_MS) ??
    DEFAULT_GEMINI_TIMEOUT_MS;
  const maxDiffCharacters =
    overrides.maxDiffCharacters ?? DEFAULT_GEMINI_MAX_DIFF_CHARACTERS;

  return {
    apiKey,
    baseUrl: normalizeBaseUrl(
      nonEmptyValue(overrides.baseUrl) ?? DEFAULT_GEMINI_BASE_URL,
    ),
    model: validateModel(model),
    timeoutMs: positiveInteger(timeoutMs, "Gemini request timeout"),
    maxDiffCharacters: positiveInteger(
      maxDiffCharacters,
      "Maximum diff character limit",
    ),
  };
}
