import type { ValidatedStagedChangeAnalysis } from "../analysis/analysis-schema.js";

export type SensitiveFileCategory =
  | "environment file"
  | "private key"
  | "credential file"
  | "Terraform state"
  | "secret manifest";

export interface SensitiveFileMatch {
  path: string;
  category: SensitiveFileCategory;
}

const sensitivePatterns: readonly {
  category: SensitiveFileCategory;
  pattern: RegExp;
}[] = [
  {
    category: "environment file",
    pattern: /(^|\/)\.env(?:\.|$)/iu,
  },
  {
    category: "private key",
    pattern:
      /(^|\/)(?:id_rsa|id_dsa|id_ecdsa|id_ed25519)(?:\.pub)?$|(?:\.pem|\.key|\.p12|\.pfx)$/iu,
  },
  {
    category: "credential file",
    pattern:
      /(^|\/)(?:credentials?|auth|token)(?:[._-][^/]*)?\.(?:json|ya?ml|toml|ini)$|(^|\/)(?:\.npmrc|\.pypirc|\.netrc)$/iu,
  },
  {
    category: "Terraform state",
    pattern: /\.tfstate(?:\.backup)?$/iu,
  },
  {
    category: "secret manifest",
    pattern: /(^|\/)secrets?(?:[._-][^/]*)?\.(?:json|ya?ml)$/iu,
  },
];

export function detectSensitiveStagedFiles(
  stagedChanges: Pick<ValidatedStagedChangeAnalysis, "files">,
): SensitiveFileMatch[] {
  const matches: SensitiveFileMatch[] = [];

  for (const file of stagedChanges.files) {
    const paths = [file.path, file.previousPath].filter(
      (path): path is string => path !== undefined,
    );

    for (const filePath of paths) {
      for (const { category, pattern } of sensitivePatterns) {
        if (pattern.test(filePath)) {
          matches.push({ path: filePath, category });
          break;
        }
      }
    }
  }

  return matches;
}

export function formatSensitiveFileWarning(
  matches: readonly SensitiveFileMatch[],
): string {
  const details = matches
    .map(({ path, category }) => `${path} (${category})`)
    .join(", ");
  return `Sensitive staged filenames detected: ${details}. Ollama processing is configured locally by default, but review the endpoint and staged content before continuing.`;
}
