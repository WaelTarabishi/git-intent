import { z } from "zod";

export const conventionalCommitTypes = [
  "build",
  "chore",
  "ci",
  "docs",
  "feat",
  "fix",
  "perf",
  "refactor",
  "revert",
  "style",
  "test",
] as const;

const singleLineText = (fieldName: string, maximumLength: number) =>
  z
    .string()
    .trim()
    .min(1, `${fieldName} cannot be empty`)
    .max(maximumLength, `${fieldName} must be at most ${maximumLength} characters`)
    .refine(
      (value) => !/[\u0000-\u001f\u007f]/u.test(value),
      `${fieldName} must not contain control characters`,
    );

export const commitSuggestionSchema = z.strictObject({
  type: z.enum(conventionalCommitTypes),
  scope: singleLineText("Scope", 50)
    .regex(
      /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/u,
      "Scope must use lowercase letters, numbers, dots, or hyphens",
    )
    .optional(),
  description: singleLineText("Description", 100),
  details: z
    .array(singleLineText("Detail", 200))
    .min(1, "At least one implementation detail is required")
    .max(6, "A suggestion can contain at most 6 implementation details"),
  tests: z
    .array(singleLineText("Test", 200))
    .max(4, "A suggestion can contain at most 4 test details"),
  breakingChanges: z
    .array(singleLineText("Breaking change", 300))
    .max(3, "A suggestion can contain at most 3 breaking changes"),
  explanation: singleLineText("Explanation", 300),
  confidence: z.number().min(0).max(1),
});

export const commitAnalysisSchema = z
  .strictObject({
    summary: singleLineText("Summary", 500),
    splitRecommended: z.boolean(),
    splitReason: singleLineText("Split reason", 500).optional(),
    recommendedSuggestionIndex: z.number().int().min(0).max(2),
    suggestions: z
      .array(commitSuggestionSchema)
      .length(3, "Exactly three commit suggestions are required"),
  })
  .superRefine((analysis, context) => {
    if (analysis.recommendedSuggestionIndex >= analysis.suggestions.length) {
      context.addIssue({
        code: "custom",
        path: ["recommendedSuggestionIndex"],
        message: "Recommended suggestion index must reference a suggestion",
      });
    }

    const uniqueSubjects = new Set(
      analysis.suggestions.map(
        (suggestion) =>
          `${suggestion.type}:${suggestion.scope ?? ""}:${suggestion.description}`,
      ),
    );
    if (uniqueSubjects.size !== analysis.suggestions.length) {
      context.addIssue({
        code: "custom",
        path: ["suggestions"],
        message: "Commit suggestions must have distinct subjects",
      });
    }
  });

export type CommitSuggestion = z.infer<typeof commitSuggestionSchema>;
export type CommitAnalysis = z.infer<typeof commitAnalysisSchema>;

export function validateCommitAnalysis(input: unknown): CommitAnalysis {
  return commitAnalysisSchema.parse(input);
}
