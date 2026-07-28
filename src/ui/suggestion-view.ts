import type {
  CommitAnalysis,
  CommitSuggestion,
} from "../analysis/commit-analysis-schema.js";

export function formatConventionalCommitMessage(
  suggestion: CommitSuggestion,
): string {
  const output = [
    formatConventionalCommitSubject(suggestion),
    "",
    ...suggestion.details.map((detail) => `- ${detail}`),
  ];

  if (suggestion.tests.length > 0) {
    output.push(
      "",
      "Tests:",
      ...suggestion.tests.map((test) => `- ${test}`),
    );
  }

  for (const breakingChange of suggestion.breakingChanges) {
    output.push("", `BREAKING CHANGE: ${breakingChange}`);
  }

  return output.join("\n");
}

export function formatConventionalCommitSubject(
  suggestion: Pick<CommitSuggestion, "type" | "scope" | "description">,
): string {
  const scope = suggestion.scope === undefined ? "" : `(${suggestion.scope})`;
  return `${suggestion.type}${scope}: ${suggestion.description}`;
}

export function formatCommitAnalysis(analysis: CommitAnalysis): string {
  const output = [`Summary: ${analysis.summary}`];

  if (analysis.splitRecommended) {
    const reason =
      analysis.splitReason === undefined ? "" : ` ${analysis.splitReason}`;
    output.push(`Warning: Splitting the staged changes is recommended.${reason}`);
  }

  const recommended =
    analysis.suggestions[analysis.recommendedSuggestionIndex];
  output.push(
    "",
    `${analysis.suggestions.length} commit ${
      analysis.suggestions.length === 1 ? "suggestion is" : "suggestions are"
    } ready.`,
  );
  if (recommended !== undefined) {
    output.push(
      `Recommended: ${formatConventionalCommitSubject(recommended)}`,
    );
  }

  return output.join("\n");
}

export function formatCommitSuggestionPreview(
  suggestion: CommitSuggestion,
  recommended: boolean,
): string {
  return [
    recommended ? "Recommended commit" : "Commit preview",
    "─".repeat(64),
    formatConventionalCommitMessage(suggestion),
    "─".repeat(64),
    `Why: ${suggestion.explanation}`,
    `Confidence: ${Math.round(suggestion.confidence * 100)}%`,
  ].join("\n");
}
