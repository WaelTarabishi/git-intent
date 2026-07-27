import { describe, expect, it } from "vitest";

import {
  stagedChangeAnalysisSchema,
  validateStagedChangeAnalysis,
} from "../src/analysis/analysis-schema.js";

const validAnalysis = {
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

describe("stagedChangeAnalysisSchema", () => {
  it("validates a well-formed staged-change analysis", () => {
    expect(validateStagedChangeAnalysis(validAnalysis)).toEqual(validAnalysis);
  });

  it("rejects inconsistent analysis statistics", () => {
    const result = stagedChangeAnalysisSchema.safeParse({
      ...validAnalysis,
      statistics: {
        ...validAnalysis.statistics,
        filesChanged: 2,
      },
    });

    expect(result.success).toBe(false);
  });
});

