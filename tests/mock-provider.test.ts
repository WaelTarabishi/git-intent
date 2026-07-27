import { describe, expect, it } from "vitest";

import { validateCommitAnalysis } from "../src/analysis/commit-analysis-schema.js";
import type { ValidatedStagedChangeAnalysis } from "../src/analysis/analysis-schema.js";
import type { CommitAnalysisProvider } from "../src/providers/commit-analysis-provider.js";
import { MockCommitAnalysisProvider } from "../src/providers/mock-provider.js";

const stagedChanges: ValidatedStagedChangeAnalysis = {
  repositoryRoot: "C:/repo",
  files: [
    {
      path: "src/cli.ts",
      status: "modified",
      binary: false,
    },
  ],
  statistics: {
    filesChanged: 1,
    insertions: 12,
    deletions: 3,
    binaryFiles: 0,
  },
  diff: "diff --git a/src/cli.ts b/src/cli.ts",
};

async function analyzeWithProvider(
  provider: CommitAnalysisProvider,
): Promise<unknown> {
  return provider.analyze({ stagedChanges });
}

describe("MockCommitAnalysisProvider", () => {
  it("implements the common provider interface", async () => {
    const result = await analyzeWithProvider(
      new MockCommitAnalysisProvider(),
    );

    expect(validateCommitAnalysis(result).suggestions).toHaveLength(3);
  });

  it("returns the same validated output for the same staged changes", async () => {
    const provider = new MockCommitAnalysisProvider();

    const first = await provider.analyze({ stagedChanges });
    const second = await provider.analyze({ stagedChanges });

    expect(first).toEqual(second);
    expect(validateCommitAnalysis(first)).toEqual(first);
    expect(first).toMatchObject({
      splitRecommended: false,
      summary: "Staged changes update 1 file with 12 insertions and 3 deletions.",
    });
  });
});
