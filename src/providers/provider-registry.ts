import type { CommitAnalysisProvider } from "./commit-analysis-provider.js";
import {
  GeminiProvider,
  type GeminiProviderOptions,
} from "./gemini-provider.js";
import { listInstalledOllamaModels } from "./ollama-models.js";
import {
  OllamaProvider,
  type OllamaProviderOptions,
} from "./ollama-provider.js";

export const providerIds = ["ollama", "gemini"] as const;
export type ProviderId = (typeof providerIds)[number];
export interface ProviderConfigurationOverrides {
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
}

export interface ProviderFactoryOptions
  extends ProviderConfigurationOverrides {
  onWarning?: (message: string) => void;
}

interface ProviderPresentation {
  displayName: string;
  description: string;
  modelSelection?: {
    loadingMessage: string;
    promptMessage: string;
  };
}

const providerPresentations: Record<ProviderId, ProviderPresentation> = {
  ollama: {
    displayName: "Ollama (local)",
    description: "Run an installed model through your Ollama server.",
    modelSelection: {
      loadingMessage: "Loading installed Ollama models...",
      promptMessage: "Select an installed Ollama model:",
    },
  },
  gemini: {
    displayName: "Gemini (cloud)",
    description: "Send the staged changes to Google Gemini using an API key.",
  },
};

export function providerPresentation(
  providerId: ProviderId,
): ProviderPresentation {
  return providerPresentations[providerId];
}

export function createProvider(
  providerId: ProviderId,
  options: ProviderFactoryOptions = {},
): CommitAnalysisProvider {
  switch (providerId) {
    case "ollama":
      return new OllamaProvider(options satisfies OllamaProviderOptions);
    case "gemini":
      return new GeminiProvider(options satisfies GeminiProviderOptions);
  }
}

export function listProviderModels(
  providerId: ProviderId,
  options: ProviderConfigurationOverrides = {},
): Promise<readonly string[]> {
  switch (providerId) {
    case "ollama":
      return listInstalledOllamaModels(options);
    case "gemini":
      return Promise.resolve([]);
  }
}
