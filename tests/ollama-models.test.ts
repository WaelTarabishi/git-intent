import { describe, expect, it, vi } from "vitest";

import {
  OllamaInvalidModelListError,
  OllamaNoModelsError,
  OllamaUnavailableError,
} from "../src/providers/ollama-errors.js";
import {
  listInstalledOllamaModels,
  type OllamaModelListOptions,
} from "../src/providers/ollama-models.js";

function options(
  response: Response,
): OllamaModelListOptions {
  return {
    baseUrl: "http://127.0.0.1:22434",
    timeoutMs: 1_000,
    httpClient: vi.fn(async () => response),
  };
}

describe("listInstalledOllamaModels", () => {
  it("returns unique installed model names in sorted order", async () => {
    const httpClient = vi.fn(async () =>
      new Response(
        JSON.stringify({
          models: [
            { name: "qwen2.5-coder:7b" },
            { name: "codellama:latest" },
            { name: "gpt-oss:120b-cloud" },
            { name: "qwen2.5-coder:7b" },
          ],
        }),
      ),
    );

    await expect(
      listInstalledOllamaModels({
        baseUrl: "http://127.0.0.1:22434",
        timeoutMs: 1_000,
        httpClient,
      }),
    ).resolves.toEqual([
      "codellama:latest",
      "qwen2.5-coder:7b",
    ]);
    expect(httpClient).toHaveBeenCalledWith(
      "http://127.0.0.1:22434/api/tags",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("reports an empty or invalid installed-model list", async () => {
    await expect(
      listInstalledOllamaModels(
        options(new Response(JSON.stringify({ models: [] }))),
      ),
    ).rejects.toBeInstanceOf(OllamaNoModelsError);

    await expect(
      listInstalledOllamaModels(
        options(new Response(JSON.stringify({ models: [{}] }))),
      ),
    ).rejects.toBeInstanceOf(OllamaInvalidModelListError);
  });

  it("reports an unreachable Ollama server", async () => {
    await expect(
      listInstalledOllamaModels({
        timeoutMs: 1_000,
        httpClient: async () => {
          throw new TypeError("connection refused");
        },
      }),
    ).rejects.toBeInstanceOf(OllamaUnavailableError);
  });

  it("reports when Ollama resets the model-list connection", async () => {
    await expect(
      listInstalledOllamaModels({
        timeoutMs: 1_000,
        httpClient: async () => {
          throw new TypeError("fetch failed", {
            cause: Object.assign(new Error("socket closed"), {
              code: "UND_ERR_SOCKET",
            }),
          });
        },
      }),
    ).rejects.toThrow(/exceeded available RAM, VRAM, or context capacity/u);
  });
});
