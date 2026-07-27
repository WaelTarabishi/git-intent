import type {
  CommitAnalysis,
  CommitSuggestion,
} from "../analysis/commit-analysis-schema.js";
import type { ValidatedStagedChangeAnalysis } from "../analysis/analysis-schema.js";
import type {
  CommitAnalysisProvider,
  CommitAnalysisRequest,
} from "./commit-analysis-provider.js";

function isDocumentationPath(filePath: string): boolean {
  const normalizedPath = filePath.toLowerCase();
  return (
    normalizedPath.startsWith("docs/") ||
    normalizedPath === "readme.md" ||
    normalizedPath.endsWith(".md")
  );
}

function isTestPath(filePath: string): boolean {
  const normalizedPath = filePath.toLowerCase();
  return (
    normalizedPath.startsWith("tests/") ||
    normalizedPath.includes(".test.") ||
    normalizedPath.includes(".spec.")
  );
}

function suggestionType(
  stagedChanges: ValidatedStagedChangeAnalysis,
): CommitSuggestion["type"] {
  const paths = stagedChanges.files.map((file) => file.path);

  if (paths.every(isDocumentationPath)) {
    return "docs";
  }
  if (paths.every(isTestPath)) {
    return "test";
  }
  if (stagedChanges.files.every((file) => file.status === "added")) {
    return "feat";
  }
  return "chore";
}

function suggestionScope(
  stagedChanges: ValidatedStagedChangeAnalysis,
): string | undefined {
  const firstPath = stagedChanges.files[0]?.path;
  if (firstPath === undefined) {
    return undefined;
  }

  const firstSegment = firstPath.split("/")[0]?.toLowerCase();
  const candidate =
    firstSegment === firstPath.toLowerCase()
      ? firstSegment.replace(/\.[^.]+$/u, "")
      : firstSegment;

  return candidate !== undefined &&
    /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/u.test(candidate)
    ? candidate
    : undefined;
}

function withOptionalScope(
  suggestion: Omit<CommitSuggestion, "scope">,
  scope: string | undefined,
): CommitSuggestion {
  return scope === undefined ? suggestion : { ...suggestion, scope };
}

function createSummary(stagedChanges: ValidatedStagedChangeAnalysis): string {
  const { filesChanged, insertions, deletions } = stagedChanges.statistics;
  const fileLabel = filesChanged === 1 ? "file" : "files";
  const insertionLabel = insertions === 1 ? "insertion" : "insertions";
  const deletionLabel = deletions === 1 ? "deletion" : "deletions";
  return `Staged changes update ${filesChanged} ${fileLabel} with ${insertions} ${insertionLabel} and ${deletions} ${deletionLabel}.`;
}

export class MockCommitAnalysisProvider implements CommitAnalysisProvider {
  readonly id = "mock";

  async analyze({
    stagedChanges,
  }: CommitAnalysisRequest): Promise<CommitAnalysis> {
    const scope = suggestionScope(stagedChanges);

    return {
      summary: createSummary(stagedChanges),
      splitRecommended: false,
      suggestions: [
        withOptionalScope(
          {
            type: suggestionType(stagedChanges),
            description: "update staged project files",
            explanation:
              "Deterministic mock suggestion based on the staged file paths and statuses.",
            confidence: 0.9,
          },
          scope,
        ),
        withOptionalScope(
          {
            type: "chore",
            description: "align project files with staged changes",
            explanation:
              "Deterministic mock alternative for testing the review workflow.",
            confidence: 0.75,
          },
          scope,
        ),
        withOptionalScope(
          {
            type: "refactor",
            description: "revise the staged implementation",
            explanation:
              "Deterministic mock alternative with a lower confidence score.",
            confidence: 0.6,
          },
          scope,
        ),
      ],
    };
  }
}
