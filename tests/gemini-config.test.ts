import { describe, expect, it } from "vitest";

import {
  DEFAULT_GEMINI_MODEL,
  resolveGeminiConfiguration,
} from "../src/providers/gemini-config.js";

describe("resolveGeminiConfiguration", () => {
  it("reads the API key and defaults from the environment", () => {
    expect(
      resolveGeminiConfiguration({}, { GEMINI_API_KEY: "test-key" }),
    ).toMatchObject({
      apiKey: "test-key",
      model: DEFAULT_GEMINI_MODEL,
      timeoutMs: 120_000,
    });
  });

  it("gives explicit overrides precedence and supports GOOGLE_API_KEY", () => {
    expect(
      resolveGeminiConfiguration(
        {
          apiKey: "override-key",
          model: "gemini-test",
          timeoutMs: 45_000,
        },
        {
          GEMINI_API_KEY: "gemini-key",
          GOOGLE_API_KEY: "google-key",
          GIT_INTENT_GEMINI_MODEL: "environment-model",
          GIT_INTENT_GEMINI_TIMEOUT_MS: "90000",
        },
      ),
    ).toMatchObject({
      apiKey: "override-key",
      model: "gemini-test",
      timeoutMs: 45_000,
    });
  });

  it("uses GOOGLE_API_KEY before GEMINI_API_KEY", () => {
    expect(
      resolveGeminiConfiguration(
        {},
        {
          GEMINI_API_KEY: "gemini-key",
          GOOGLE_API_KEY: "google-key",
        },
      ).apiKey,
    ).toBe("google-key");
  });

  it("rejects missing credentials without including a key value", () => {
    expect(() => resolveGeminiConfiguration({}, {})).toThrow(
      "Set GEMINI_API_KEY (or GOOGLE_API_KEY)",
    );
  });

  it("rejects invalid model names and timeouts", () => {
    expect(() =>
      resolveGeminiConfiguration(
        { model: "../other-model" },
        { GEMINI_API_KEY: "test-key" },
      ),
    ).toThrow("model name is invalid");
    expect(() =>
      resolveGeminiConfiguration(
        {},
        {
          GEMINI_API_KEY: "test-key",
          GIT_INTENT_GEMINI_TIMEOUT_MS: "not-a-number",
        },
      ),
    ).toThrow("must be a positive integer");
  });
});
