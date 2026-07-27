#!/usr/bin/env node

import { confirm } from "@inquirer/prompts";
import { Command, Option } from "commander";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  validateStagedChangeAnalysis,
  type ValidatedStagedChangeAnalysis,
} from "./analysis/analysis-schema.js";
import { GitService } from "./git/git-service.js";
import { formatFullDiff, formatInspection } from "./ui/inspection-view.js";

interface InspectOptions {
  json?: boolean;
  showDiff?: boolean;
}

function isPromptCancellation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "ExitPromptError"
  );
}

async function displayInspection(
  analysis: ValidatedStagedChangeAnalysis,
  options: InspectOptions,
): Promise<void> {
  if (options.json === true) {
    process.stdout.write(`${JSON.stringify(analysis, null, 2)}\n`);
    return;
  }

  process.stdout.write(`${formatInspection(analysis)}\n`);

  if (options.showDiff === true) {
    process.stdout.write(`${formatFullDiff(analysis.diff)}\n`);
    return;
  }

  const shouldShowDiff = await confirm({
    message: "Display the full staged diff?",
    default: false,
  });

  if (shouldShowDiff) {
    process.stdout.write(`${formatFullDiff(analysis.diff)}\n`);
  }
}

export function createProgram(): Command {
  const program = new Command();

  program
    .name("smart-commit")
    .description("Inspect staged Git changes without modifying the repository.")
    .version("0.1.0")
    .showHelpAfterError();

  program
    .command("inspect")
    .description("Inspect the files and diff currently staged in Git.")
    .addOption(
      new Option(
        "--json",
        "print the validated staged-change analysis as JSON without prompting",
      ).conflicts("showDiff"),
    )
    .addOption(
      new Option(
        "--show-diff",
        "display the full staged diff without prompting",
      ).conflicts("json"),
    )
    .action(async (options: InspectOptions) => {
      try {
        const unvalidatedAnalysis =
          await new GitService().inspectStagedChanges();
        const analysis = validateStagedChangeAnalysis(unvalidatedAnalysis);
        await displayInspection(analysis, options);
      } catch (error) {
        if (isPromptCancellation(error)) {
          process.stderr.write("Inspection cancelled.\n");
          return;
        }

        const message =
          error instanceof Error
            ? error.message
            : "Inspection failed because of an unexpected error.";
        process.stderr.write(`Error: ${message}\n`);
        process.exitCode = 1;
      }
    });

  return program;
}

export async function runCli(argv = process.argv): Promise<void> {
  await createProgram().parseAsync(argv);
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : undefined;
if (entryPath !== undefined && fileURLToPath(import.meta.url) === entryPath) {
  await runCli();
}

