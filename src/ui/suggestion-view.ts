import type {
  CommitAnalysis,
  CommitSuggestion,
} from "../analysis/commit-analysis-schema.js";
import { createTheme, type TerminalTheme } from "./theme.js";

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

export function formatStyledConventionalCommitSubject(
  suggestion: Pick<CommitSuggestion, "type" | "scope" | "description">,
  theme: TerminalTheme = createTheme(),
): string {
  const scope =
    suggestion.scope === undefined
      ? ""
      : theme.secondary(`(${suggestion.scope})`);
  return `${theme.commitType(suggestion.type, suggestion.type)}${scope}${theme.muted(
    ":",
  )} ${theme.primary(suggestion.description)}`;
}

export function formatCommitAnalysis(
  analysis: CommitAnalysis,
  theme: TerminalTheme = createTheme(),
): string {
  const output = [
    `${theme.brand("◆")} ${theme.heading("Analysis summary")}`,
    `  ${theme.primary(analysis.summary)}`,
  ];

  if (analysis.splitRecommended) {
    const reason =
      analysis.splitReason === undefined ? "" : ` ${analysis.splitReason}`;
    output.push(
      "",
      `${theme.warning("⚠ Split recommended")} ${theme.warning(
        `Splitting the staged changes is recommended.${reason}`,
      )}`,
    );
  }

  const recommended =
    analysis.suggestions[analysis.recommendedSuggestionIndex];
  output.push(
    "",
    `${theme.accent("✦")} ${theme.heading("Suggestions")} ${theme.muted(
      `· ${analysis.suggestions.length} commit ${
        analysis.suggestions.length === 1 ? "suggestion is" : "suggestions are"
      } ready`,
    )}`,
  );
  if (recommended !== undefined) {
    output.push(
      `${theme.success("★ Recommended")} ${theme.muted(
        "·",
      )} ${formatStyledConventionalCommitSubject(recommended, theme)}`,
    );
  }

  return output.join("\n");
}

export function formatCommitSuggestionPreview(
  suggestion: CommitSuggestion,
  recommended: boolean,
  theme: TerminalTheme = createTheme(),
): string {
  const title = recommended ? "★ Recommended commit" : "✦ Commit preview";
  const width = 64;
  const topBorder = `╭─ ${title} ${"─".repeat(
    Math.max(1, width - title.length - 4),
  )}╮`;
  const bottomBorder = `╰${"─".repeat(width)}╯`;
  const body = [
    formatStyledCommitMessage(suggestion, theme),
    "",
    `${theme.accent("Why:")} ${theme.secondary(suggestion.explanation)}`,
    `${theme.accent("Confidence:")} ${theme.confidence(
      suggestion.confidence,
      `${Math.round(suggestion.confidence * 100)}%`,
    )}`,
  ];

  return [
    theme.heading(topBorder),
    ...body.flatMap((section) =>
      section
        .split("\n")
        .map((line) => `${theme.heading("│")} ${line}`),
    ),
    theme.heading(bottomBorder),
  ].join("\n");
}

function formatStyledCommitMessage(
  suggestion: CommitSuggestion,
  theme: TerminalTheme,
): string {
  const output = [
    formatStyledConventionalCommitSubject(suggestion, theme),
    "",
    ...suggestion.details.map(
      (detail) => `${theme.accent("•")} ${theme.primary(detail)}`,
    ),
  ];

  if (suggestion.tests.length > 0) {
    output.push(
      "",
      theme.info("Tests"),
      ...suggestion.tests.map(
        (test) => `${theme.info("✓")} ${theme.secondary(test)}`,
      ),
    );
  }

  for (const breakingChange of suggestion.breakingChanges) {
    output.push(
      "",
      `${theme.danger("⚡ BREAKING CHANGE")} ${theme.danger(breakingChange)}`,
    );
  }

  return output.join("\n");
}
