import { describe, expect, it } from "vitest";

import {
  formatCommitAnalysis,
  formatCommitSuggestionPreview,
  formatConventionalCommitMessage,
  formatConventionalCommitSubject,
} from "../src/ui/suggestion-view.js";

const detailedSuggestion = {
  type: "feat" as const,
  scope: "cli",
  description: "add detailed commit suggestions",
  details: [
    "Generate a structured body from the staged implementation changes.",
    "Keep the compact subject separate from the detailed preview.",
  ],
  tests: ["Cover detailed message formatting."],
  breakingChanges: ["Consumers must provide detailed suggestion fields."],
  explanation: "This subject best represents the staged CLI and schema work.",
  confidence: 0.94,
};

describe("commit suggestion formatting", () => {
  it("formats a Conventional Commit message without a scope", () => {
    expect(
      formatConventionalCommitSubject({
        type: "docs",
        description: "update the architecture guide",
      }),
    ).toBe("docs: update the architecture guide");
  });

  it("formats a Conventional Commit message with a scope", () => {
    expect(
      formatConventionalCommitSubject({
        type: "feat",
        scope: "cli",
        description: "add mock suggestions",
      }),
    ).toBe("feat(cli): add mock suggestions");
  });

  it("formats a detailed message with tests and breaking changes", () => {
    expect(formatConventionalCommitMessage(detailedSuggestion)).toBe(
      [
        "feat(cli): add detailed commit suggestions",
        "",
        "- Generate a structured body from the staged implementation changes.",
        "- Keep the compact subject separate from the detailed preview.",
        "",
        "Tests:",
        "- Cover detailed message formatting.",
        "",
        "BREAKING CHANGE: Consumers must provide detailed suggestion fields.",
      ].join("\n"),
    );
  });

  it("shows only the recommended subject in the overview", () => {
    const output = formatCommitAnalysis({
      summary: "The staged changes improve commit suggestions.",
      splitRecommended: false,
      recommendedSuggestionIndex: 0,
      suggestions: [detailedSuggestion],
    });

    expect(output).toContain(
      "★ Recommended · feat(cli): add detailed commit suggestions",
    );
    expect(output).not.toContain(detailedSuggestion.details[0]);
  });

  it("shows details only in the focused preview", () => {
    const output = formatCommitSuggestionPreview(detailedSuggestion, true);

    expect(output).toContain("Recommended commit");
    expect(output).toContain(detailedSuggestion.details[0]);
    expect(output).toContain("Confidence: 94%");
    expect(output).toContain("╭─ ★ Recommended commit");
    expect(output).toContain("╰────────────────");
  });
});
