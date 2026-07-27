import type { ValidatedStagedChangeAnalysis } from "../analysis/analysis-schema.js";
import type { StagedFileStatus } from "../git/git-types.js";

const statusLabels: Record<StagedFileStatus, string> = {
  added: "A",
  modified: "M",
  deleted: "D",
  renamed: "R",
  copied: "C",
  "type-changed": "T",
  unmerged: "U",
  unknown: "?",
};

function pluralized(
  count: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function formatInspection(
  analysis: ValidatedStagedChangeAnalysis,
): string {
  const fileLines = analysis.files.map((file) => {
    const path =
      file.previousPath === undefined
        ? file.path
        : `${file.previousPath} -> ${file.path}`;
    const binarySuffix = file.binary ? " (binary)" : "";
    return `  ${statusLabels[file.status]} ${path}${binarySuffix}`;
  });

  const statistics = analysis.statistics;
  const summaryParts = [
    pluralized(statistics.filesChanged, "file") + " changed",
    `${pluralized(statistics.insertions, "insertion")}(+)`,
    `${pluralized(statistics.deletions, "deletion")}(-)`,
  ];

  if (statistics.binaryFiles > 0) {
    summaryParts.push(pluralized(statistics.binaryFiles, "binary file"));
  }

  return [
    `Staged changes (${pluralized(analysis.files.length, "file")}):`,
    ...fileLines,
    "",
    `Statistics: ${summaryParts.join(", ")}`,
  ].join("\n");
}

export function formatFullDiff(diff: string): string {
  return ["", "Full staged diff:", diff || "(empty diff)"].join("\n");
}

