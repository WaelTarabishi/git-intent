import { describe, expect, it } from "vitest";

import {
  commitAnalysisSchema,
  validateCommitAnalysis,
} from "../src/analysis/commit-analysis-schema.js";

const validCommitAnalysis = {
  summary: "The staged changes update the CLI.",
  splitRecommended: false,
  suggestions: [
    {
      type: "feat",
      scope: "cli",
      description: "add commit suggestions",
      explanation: "The staged diff adds a new user-facing command.",
      confidence: 0.9,
    },
  ],
};

describe("commitAnalysisSchema", () => {
  it("validates a complete structured provider response", () => {
    expect(validateCommitAnalysis(validCommitAnalysis)).toEqual(
      validCommitAnalysis,
    );
  });

  it("accepts an optional split reason", () => {
    const analysis = {
      ...validCommitAnalysis,
      splitRecommended: true,
      splitReason: "The source and documentation changes can stand alone.",
    };

    expect(validateCommitAnalysis(analysis)).toEqual(analysis);
  });

  it("rejects invalid Conventional Commit types", () => {
    const result = commitAnalysisSchema.safeParse({
      ...validCommitAnalysis,
      suggestions: [
        {
          ...validCommitAnalysis.suggestions[0],
          type: "feature",
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it.each([-0.01, 1.01])("rejects confidence value %s", (confidence) => {
    const result = commitAnalysisSchema.safeParse({
      ...validCommitAnalysis,
      suggestions: [
        {
          ...validCommitAnalysis.suggestions[0],
          confidence,
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects an empty suggestions array", () => {
    const result = commitAnalysisSchema.safeParse({
      ...validCommitAnalysis,
      suggestions: [],
    });

    expect(result.success).toBe(false);
  });
});
