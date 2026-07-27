import type {
  CommitAnalysis,
  CommitSuggestion,
} from "../analysis/commit-analysis-schema.js";

export function formatConventionalCommitMessage(
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

  output.push("", "Commit suggestions:");
  analysis.suggestions.forEach((suggestion, index) => {
    output.push(
      `  ${index + 1}. ${formatConventionalCommitMessage(suggestion)}`,
      `     ${suggestion.explanation}`,
      `     Confidence: ${Math.round(suggestion.confidence * 100)}%`,
    );
  });

  return output.join("\n");
}
