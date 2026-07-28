export const stagedFileStatuses = [
  "added",
  "modified",
  "deleted",
  "renamed",
  "copied",
  "type-changed",
  "unmerged",
  "unknown",
] as const;

export type StagedFileStatus = (typeof stagedFileStatuses)[number];

export interface StagedFile {
  path: string;
  previousPath?: string;
  status: StagedFileStatus;
  binary: boolean;
}

export interface ChangeStatistics {
  filesChanged: number;
  insertions: number;
  deletions: number;
  binaryFiles: number;
}

export interface StagedChangeAnalysis {
  repositoryRoot: string;
  files: StagedFile[];
  statistics: ChangeStatistics;
  diff: string;
  recentCommitMessages?: string[];
}

export interface GitCommandResult {
  stdout: string;
  stderr?: string;
}

export type GitCommandRunner = (
  args: readonly string[],
  cwd: string,
) => Promise<GitCommandResult>;
