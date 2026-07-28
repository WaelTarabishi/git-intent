import { describe, expect, it } from "vitest";

import {
  commitAnalysisSchema,
  validateCommitAnalysis,
} from "../src/analysis/commit-analysis-schema.js";

const validCommitAnalysis = {
  summary: "The staged changes update the CLI.",
  splitRecommended: false,
  recommendedSuggestionIndex: 0,
  suggestions: [
    {
      type: "feat",
      scope: "cli",
      description: "add commit suggestions",
      details: [
        "Add a provider-backed command for reviewing commit suggestions.",
      ],
      tests: ["Cover the new suggestion command."],
      breakingChanges: [],
      explanation: "The staged diff adds a new user-facing command.",
      confidence: 0.9,
    },
    {
      type: "refactor",
      scope: "cli",
      description: "organize commit analysis",
      details: ["Separate analysis from interactive review."],
      tests: [],
      breakingChanges: [],
      explanation: "A structure-focused alternative.",
      confidence: 0.8,
    },
    {
      type: "test",
      scope: "cli",
      description: "cover commit suggestions",
      details: ["Exercise commit suggestion behavior."],
      tests: ["Add commit suggestion regression coverage."],
      breakingChanges: [],
      explanation: "A test-focused alternative.",
      confidence: 0.7,
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

  it.each([1, 2, 4])(
    "rejects a provider response containing %s suggestions",
    (suggestionCount) => {
      const suggestions = [
        ...validCommitAnalysis.suggestions,
        {
          ...validCommitAnalysis.suggestions[0],
          description: "add another commit suggestion",
        },
      ].slice(0, suggestionCount);

      const result = commitAnalysisSchema.safeParse({
        ...validCommitAnalysis,
        suggestions,
      });

      expect(result.success).toBe(false);
    },
  );

  it("rejects duplicate commit subjects", () => {
    const duplicate = validCommitAnalysis.suggestions[0];
    const result = commitAnalysisSchema.safeParse({
      ...validCommitAnalysis,
      suggestions: [duplicate, duplicate, duplicate],
    });

    expect(result.success).toBe(false);
  });

  it("rejects a recommended index that does not reference a suggestion", () => {
    const result = commitAnalysisSchema.safeParse({
      ...validCommitAnalysis,
      recommendedSuggestionIndex: 3,
    });

    expect(result.success).toBe(false);
  });

  it("requires at least one detail for every suggestion", () => {
    const result = commitAnalysisSchema.safeParse({
      ...validCommitAnalysis,
      suggestions: [
        {
          ...validCommitAnalysis.suggestions[0],
          details: [],
        },
      ],
    });

    expect(result.success).toBe(false);
  });
});
