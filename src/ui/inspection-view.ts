import type { ValidatedStagedChangeAnalysis } from "../analysis/analysis-schema.js";
import type { StagedFileStatus } from "../git/git-types.js";
import { createTheme, type TerminalTheme } from "./theme.js";

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
  theme: TerminalTheme = createTheme(),
): string {
  const fileLines = analysis.files.map((file) => {
    const path =
      file.previousPath === undefined
        ? file.path
        : `${file.previousPath} -> ${file.path}`;
    const status = statusLabels[file.status];
    const binarySuffix = file.binary ? theme.accent(" (binary)") : "";
    return `  ${theme.fileStatus(status, status)} ${theme.primary(path)}${binarySuffix}`;
  });

  const statistics = analysis.statistics;
  const summaryParts = [
    theme.primary(pluralized(statistics.filesChanged, "file") + " changed"),
    theme.success(`+${pluralized(statistics.insertions, "insertion")}`),
    theme.danger(`-${pluralized(statistics.deletions, "deletion")}`),
  ];

  if (statistics.binaryFiles > 0) {
    summaryParts.push(
      theme.accent(pluralized(statistics.binaryFiles, "binary file")),
    );
  }

  return [
    `${theme.brand("◆")} ${theme.heading("Staged changes")} ${theme.muted(
      `· ${pluralized(analysis.files.length, "file")}`,
    )}`,
    ...fileLines,
    "",
    `${theme.accent("Σ")} ${theme.heading("Statistics")} ${theme.muted(
      "·",
    )} ${summaryParts.join(theme.muted(" · "))}`,
  ].join("\n");
}

export function formatFullDiff(
  diff: string,
  theme: TerminalTheme = createTheme(),
): string {
  return [
    "",
    `${theme.accent("◇")} ${theme.heading("Full staged diff")}`,
    diff || theme.muted("(empty diff)"),
  ].join("\n");
}
