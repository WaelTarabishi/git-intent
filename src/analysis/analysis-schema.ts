import { z } from "zod";

import { stagedFileStatuses } from "../git/git-types.js";

export const stagedFileSchema = z.object({
  path: z.string().min(1),
  previousPath: z.string().min(1).optional(),
  status: z.enum(stagedFileStatuses),
  binary: z.boolean(),
});

export const changeStatisticsSchema = z.object({
  filesChanged: z.number().int().nonnegative(),
  insertions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  binaryFiles: z.number().int().nonnegative(),
});

export const stagedChangeAnalysisSchema = z
  .object({
    repositoryRoot: z.string().min(1),
    files: z.array(stagedFileSchema).min(1),
    statistics: changeStatisticsSchema,
    diff: z.string(),
  })
  .superRefine((analysis, context) => {
    if (analysis.statistics.filesChanged !== analysis.files.length) {
      context.addIssue({
        code: "custom",
        path: ["statistics", "filesChanged"],
        message: "filesChanged must match the number of staged files",
      });
    }

    const binaryFileCount = analysis.files.filter((file) => file.binary).length;
    if (analysis.statistics.binaryFiles !== binaryFileCount) {
      context.addIssue({
        code: "custom",
        path: ["statistics", "binaryFiles"],
        message: "binaryFiles must match the staged binary file count",
      });
    }
  });

export type ValidatedStagedChangeAnalysis = z.infer<
  typeof stagedChangeAnalysisSchema
>;

export function validateStagedChangeAnalysis(
  input: unknown,
): ValidatedStagedChangeAnalysis {
  return stagedChangeAnalysisSchema.parse(input);
}

