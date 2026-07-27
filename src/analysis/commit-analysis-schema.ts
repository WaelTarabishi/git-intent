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
  explanation: singleLineText("Explanation", 300),
  confidence: z.number().min(0).max(1),
});

export const commitAnalysisSchema = z.strictObject({
  summary: singleLineText("Summary", 500),
  splitRecommended: z.boolean(),
  splitReason: singleLineText("Split reason", 500).optional(),
  suggestions: z.array(commitSuggestionSchema).min(1).max(3),
});

export type CommitSuggestion = z.infer<typeof commitSuggestionSchema>;
export type CommitAnalysis = z.infer<typeof commitAnalysisSchema>;

export function validateCommitAnalysis(input: unknown): CommitAnalysis {
  return commitAnalysisSchema.parse(input);
}
