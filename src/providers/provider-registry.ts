import { MockCommitAnalysisProvider } from "./mock-provider.js";
import type { CommitAnalysisProvider } from "./commit-analysis-provider.js";
import {
  OllamaProvider,
  type OllamaProviderOptions,
} from "./ollama-provider.js";

export const providerIds = ["mock", "ollama"] as const;
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
    case "mock":
      return new MockCommitAnalysisProvider();
    case "ollama":
      return new OllamaProvider(options);
  }
}
