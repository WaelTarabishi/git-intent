import { MockCommitAnalysisProvider } from "./mock-provider.js";
import type { CommitAnalysisProvider } from "./commit-analysis-provider.js";

export const providerIds = ["mock"] as const;
export type ProviderId = (typeof providerIds)[number];

export function createProvider(providerId: ProviderId): CommitAnalysisProvider {
  switch (providerId) {
    case "mock":
      return new MockCommitAnalysisProvider();
  }
}
