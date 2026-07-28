import type { CommitAnalysisProvider } from "./commit-analysis-provider.js";
import { listInstalledOllamaModels } from "./ollama-models.js";
import {
  OllamaProvider,
  type OllamaProviderOptions,
} from "./ollama-provider.js";

export const providerIds = ["ollama"] as const;
export type ProviderId = (typeof providerIds)[number];
export type ProviderConfigurationOverrides = Pick<
  OllamaProviderOptions,
  "baseUrl" | "model" | "timeoutMs"
>;

export function createProvider(
  providerId: ProviderId,
  options: OllamaProviderOptions = {},
): CommitAnalysisProvider {
  switch (providerId) {
    case "ollama":
      return new OllamaProvider(options);
  }
}

export function listProviderModels(
  providerId: ProviderId,
  options: ProviderConfigurationOverrides = {},
): Promise<readonly string[]> {
  switch (providerId) {
    case "ollama":
      return listInstalledOllamaModels(options);
  }
}
