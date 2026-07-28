import { describe, expect, it } from "vitest";

import {
  DEFAULT_MAX_DIFF_CHARACTERS,
  DEFAULT_OLLAMA_MODEL,
  DEFAULT_OLLAMA_TIMEOUT_MS,
  DEFAULT_OLLAMA_URL,
  resolveOllamaConfiguration,
} from "../src/providers/ollama-config.js";

describe("resolveOllamaConfiguration", () => {
  it("uses documented defaults", () => {
    expect(resolveOllamaConfiguration({}, {})).toEqual({
      baseUrl: DEFAULT_OLLAMA_URL,
      model: DEFAULT_OLLAMA_MODEL,
      timeoutMs: DEFAULT_OLLAMA_TIMEOUT_MS,
      maxDiffCharacters: DEFAULT_MAX_DIFF_CHARACTERS,
    });
  });

  it("uses environment variables instead of defaults", () => {
    expect(
      resolveOllamaConfiguration(
        {},
        {
          GIT_INTENT_OLLAMA_URL: "http://127.0.0.1:22434/",
          GIT_INTENT_OLLAMA_MODEL: "custom-coder:latest",
          GIT_INTENT_OLLAMA_TIMEOUT_MS: "45000",
        },
      ),
    ).toMatchObject({
      baseUrl: "http://127.0.0.1:22434",
      model: "custom-coder:latest",
      timeoutMs: 45_000,
    });
  });

  it("uses explicit CLI-style overrides instead of environment variables", () => {
    expect(
      resolveOllamaConfiguration(
        {
          baseUrl: "http://localhost:33445",
          model: "cli-model:7b",
          timeoutMs: 9_000,
        },
        {
          GIT_INTENT_OLLAMA_URL: "http://environment.invalid:11434",
          GIT_INTENT_OLLAMA_MODEL: "environment-model",
          GIT_INTENT_OLLAMA_TIMEOUT_MS: "8000",
        },
      ),
    ).toMatchObject({
      baseUrl: "http://localhost:33445",
      model: "cli-model:7b",
      timeoutMs: 9_000,
    });
  });

  it("rejects known Ollama cloud models and direct cloud endpoints", () => {
    expect(() =>
      resolveOllamaConfiguration({ model: "gpt-oss:120b-cloud" }, {}),
    ).toThrow("cloud models are not supported");
    expect(() =>
      resolveOllamaConfiguration(
        { baseUrl: "https://api.ollama.com" },
        {},
      ),
    ).toThrow("cloud endpoints are not supported");
  });
});
