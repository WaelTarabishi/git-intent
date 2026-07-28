#!/usr/bin/env node

import {
  confirm as confirmPrompt,
  input as inputPrompt,
  select as selectPrompt,
} from "@inquirer/prompts";
import { Command, InvalidArgumentError, Option } from "commander";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  validateCommitAnalysis,
  type CommitAnalysis,
} from "./analysis/commit-analysis-schema.js";
import {
  validateStagedChangeAnalysis,
  type ValidatedStagedChangeAnalysis,
} from "./analysis/analysis-schema.js";
import { loadProjectEnvironment } from "./config/environment.js";
import { GitService } from "./git/git-service.js";
import type { StagedChangeAnalysis } from "./git/git-types.js";
import type { CommitAnalysisProvider } from "./providers/commit-analysis-provider.js";
import {
  createProvider,
  listProviderModels,
  providerIds,
  providerPresentation,
  type ProviderConfigurationOverrides,
  type ProviderId,
} from "./providers/provider-registry.js";
import { formatFullDiff, formatInspection } from "./ui/inspection-view.js";
import {
  formatCommitAnalysis,
  formatConventionalCommitMessage,
  formatConventionalCommitSubject,
  formatCommitSuggestionPreview,
} from "./ui/suggestion-view.js";

interface InspectOptions {
  json?: boolean;
  showDiff?: boolean;
}

interface SuggestOptions {
  json?: boolean;
  provider?: ProviderId;
  ollamaUrl?: string;
  model?: string;
  ollamaTimeout?: number;
  geminiTimeout?: number;
}

interface SelectChoice {
  name: string;
  value: string;
  description?: string;
}

export interface CliDependencies {
  inspectStagedChanges(): Promise<StagedChangeAnalysis>;
  resolveProvider(
    providerId: ProviderId,
    options?: ProviderConfigurationOverrides,
  ): CommitAnalysisProvider;
  listProviderModels(
    providerId: ProviderId,
    options?: ProviderConfigurationOverrides,
  ): Promise<readonly string[]>;
  confirm(options: { message: string; default?: boolean }): Promise<boolean>;
  select(options: {
    message: string;
    choices: readonly SelectChoice[];
  }): Promise<string>;
  input(options: {
    message: string;
    validate(value: string): boolean | string;
  }): Promise<string>;
  writeOutput(value: string): void;
  writeError(value: string): void;
  setExitCode(value: number): void;
}

const defaultDependencies: CliDependencies = {
  inspectStagedChanges: async () => new GitService().inspectStagedChanges(),
  resolveProvider: createProvider,
  listProviderModels,
  confirm: async (options) => confirmPrompt(options),
  select: async (options) => selectPrompt(options),
  input: async (options) => inputPrompt(options),
  writeOutput: (value) => process.stdout.write(value),
  writeError: (value) => process.stderr.write(value),
  setExitCode: (value) => {
    process.exitCode = value;
  },
};

function parsePositiveInteger(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new InvalidArgumentError("Value must be a positive integer.");
  }
  return parsed;
}

function providerConfigurationOverrides(
  options: SuggestOptions,
  providerId: ProviderId,
): ProviderConfigurationOverrides | undefined {
  const overrides: ProviderConfigurationOverrides = {};

  if (options.ollamaUrl !== undefined) {
    overrides.baseUrl = options.ollamaUrl;
  }
  if (options.model !== undefined) {
    overrides.model = options.model;
  }
  if (providerId === "ollama" && options.ollamaTimeout !== undefined) {
    overrides.timeoutMs = options.ollamaTimeout;
  }
  if (providerId === "gemini" && options.geminiTimeout !== undefined) {
    overrides.timeoutMs = options.geminiTimeout;
  }

  return Object.keys(overrides).length === 0 ? undefined : overrides;
}

function isProviderId(value: string): value is ProviderId {
  return providerIds.some((providerId) => providerId === value);
}

interface SelectedProvider {
  providerId: ProviderId;
  configuration?: ProviderConfigurationOverrides;
}

async function selectProviderConfiguration(
  options: SuggestOptions,
  dependencies: CliDependencies,
): Promise<SelectedProvider> {
  let providerId = options.provider;
  if (providerId === undefined) {
    if (options.json === true) {
      providerId = "ollama";
    } else {
      const selection = await dependencies.select({
        message: "Select a commit-analysis provider:",
        choices: providerIds.map((id) => ({
          name: providerPresentation(id).displayName,
          value: id,
          description: providerPresentation(id).description,
        })),
      });
      if (!isProviderId(selection)) {
        throw new Error("The selected provider is not available.");
      }
      providerId = selection;
    }
  }

  let configuration = providerConfigurationOverrides(options, providerId);
  const modelSelection = providerPresentation(providerId).modelSelection;
  if (
    options.json !== true &&
    options.model === undefined &&
    modelSelection !== undefined
  ) {
    dependencies.writeOutput(`${modelSelection.loadingMessage}\n`);
    const installedModels = await dependencies.listProviderModels(
      providerId,
      configuration,
    );
    const selectedModel = await dependencies.select({
      message: modelSelection.promptMessage,
      choices: installedModels.map((model) => ({
        name: model,
        value: model,
      })),
    });
    if (!installedModels.includes(selectedModel)) {
      throw new Error("The selected Ollama model is not available.");
    }
    configuration = {
      ...configuration,
      model: selectedModel,
    };
  }

  return configuration === undefined
    ? { providerId }
    : { providerId, configuration };
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
  dependencies: CliDependencies,
): Promise<void> {
  if (options.json === true) {
    dependencies.writeOutput(`${JSON.stringify(analysis, null, 2)}\n`);
    return;
  }

  dependencies.writeOutput(`${formatInspection(analysis)}\n`);

  if (options.showDiff === true) {
    dependencies.writeOutput(`${formatFullDiff(analysis.diff)}\n`);
    return;
  }

  const shouldShowDiff = await dependencies.confirm({
    message: "Display the full staged diff?",
    default: false,
  });

  if (shouldShowDiff) {
    dependencies.writeOutput(`${formatFullDiff(analysis.diff)}\n`);
  }
}

async function displaySuggestionSelection(
  analysis: CommitAnalysis,
  dependencies: CliDependencies,
): Promise<void> {
  dependencies.writeOutput(`${formatCommitAnalysis(analysis)}\n`);

  const suggestionIndexes = analysis.suggestions.map((_, index) => index);
  suggestionIndexes.sort((left, right) => {
    if (left === analysis.recommendedSuggestionIndex) {
      return -1;
    }
    if (right === analysis.recommendedSuggestionIndex) {
      return 1;
    }
    return left - right;
  });

  const choices: SelectChoice[] = suggestionIndexes.map((index) => {
    const suggestion = analysis.suggestions[index]!;
    const recommended = index === analysis.recommendedSuggestionIndex;
    return {
      name: `${
        recommended ? "★ Recommended  " : "  Alternative  "
      }${formatConventionalCommitSubject(suggestion)}`,
      value: `suggestion:${index}`,
      description: `${Math.round(suggestion.confidence * 100)}% confidence`,
    };
  });
  choices.push({
    name: "Enter a custom message",
    value: "custom",
    description: "Type a commit message without creating a commit.",
  });

  while (true) {
    const selection = await dependencies.select({
      message: "Choose a commit message to preview:",
      choices,
    });

    if (selection === "custom") {
      const selectedMessage = (
        await dependencies.input({
          message: "Custom commit message:",
          validate: (value) =>
            value.trim().length > 0 || "Commit message cannot be empty.",
        })
      ).trim();

      if (selectedMessage.length === 0) {
        throw new Error("Custom commit message cannot be empty.");
      }
      dependencies.writeOutput(
        `Selected commit message:\n${selectedMessage}\n`,
      );
      return;
    }

    const selectedIndex = Number.parseInt(
      selection.replace("suggestion:", ""),
      10,
    );
    const suggestion = analysis.suggestions[selectedIndex];
    if (suggestion === undefined) {
      throw new Error("The selected commit suggestion is not available.");
    }

    dependencies.writeOutput(
      `\n${formatCommitSuggestionPreview(
        suggestion,
        selectedIndex === analysis.recommendedSuggestionIndex,
      )}\n`,
    );
    const useSuggestion = await dependencies.confirm({
      message: "Use this commit message?",
      default: true,
    });
    if (useSuggestion) {
      dependencies.writeOutput(
        `Selected commit message:\n${formatConventionalCommitMessage(
          suggestion,
        )}\n`,
      );
      return;
    }

    dependencies.writeOutput("\nChoose another suggestion.\n");
  }
}

function reportActionError(
  error: unknown,
  cancellationMessage: string,
  fallbackMessage: string,
  dependencies: CliDependencies,
): void {
  if (isPromptCancellation(error)) {
    dependencies.writeError(`${cancellationMessage}\n`);
    return;
  }

  const message = error instanceof Error ? error.message : fallbackMessage;
  dependencies.writeError(`Error: ${message}\n`);
  dependencies.setExitCode(1);
}

export function createProgram(
  dependencyOverrides: Partial<CliDependencies> = {},
): Command {
  const dependencies = { ...defaultDependencies, ...dependencyOverrides };
  if (dependencyOverrides.resolveProvider === undefined) {
    dependencies.resolveProvider = (providerId, options) =>
      createProvider(providerId, {
        ...options,
        onWarning: (message) =>
          dependencies.writeError(`Warning: ${message}\n`),
      });
  }
  const program = new Command();

  program
    .name("git-intent")
    .description("Inspect and analyze staged Git changes without modifying Git.")
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
        const unvalidatedAnalysis = await dependencies.inspectStagedChanges();
        const analysis = validateStagedChangeAnalysis(unvalidatedAnalysis);
        await displayInspection(analysis, options, dependencies);
      } catch (error) {
        reportActionError(
          error,
          "Inspection cancelled.",
          "Inspection failed because of an unexpected error.",
          dependencies,
        );
      }
    });

  program
    .command("suggest")
    .alias("generate")
    .description(
      "Analyze staged changes with a provider and review commit suggestions.",
    )
    .option("--json", "print only the complete validated provider response as JSON")
    .addOption(
      new Option("--provider <provider>", "commit-analysis provider")
        .choices([...providerIds]),
    )
    .addOption(
      new Option(
        "--ollama-url <url>",
        "override the Ollama base URL",
      ).implies({ provider: "ollama" }),
    )
    .addOption(
      new Option(
        "--model <model>",
        "override the provider model name",
      ),
    )
    .addOption(
      new Option(
        "--ollama-timeout <milliseconds>",
        "override the Ollama request timeout",
      )
        .argParser(parsePositiveInteger)
        .implies({ provider: "ollama" }),
    )
    .addOption(
      new Option(
        "--gemini-timeout <milliseconds>",
        "override the Gemini request timeout",
      )
        .argParser(parsePositiveInteger)
        .implies({ provider: "gemini" }),
    )
    .action(async (options: SuggestOptions) => {
      try {
        const unvalidatedStagedChanges =
          await dependencies.inspectStagedChanges();
        const stagedChanges = validateStagedChangeAnalysis(
          unvalidatedStagedChanges,
        );
        const selectedProvider = await selectProviderConfiguration(
          options,
          dependencies,
        );
        const provider =
          selectedProvider.configuration === undefined
            ? dependencies.resolveProvider(selectedProvider.providerId)
            : dependencies.resolveProvider(
                selectedProvider.providerId,
                selectedProvider.configuration,
              );

        if (
          options.json !== true &&
          provider.progressMessage !== undefined
        ) {
          dependencies.writeOutput(`${provider.progressMessage}\n`);
        }

        const unvalidatedCommitAnalysis = await provider.analyze({
          stagedChanges,
        });
        const commitAnalysis = validateCommitAnalysis(
          unvalidatedCommitAnalysis,
        );

        if (options.json === true) {
          dependencies.writeOutput(
            `${JSON.stringify(commitAnalysis, null, 2)}\n`,
          );
          return;
        }

        await displaySuggestionSelection(commitAnalysis, dependencies);
      } catch (error) {
        reportActionError(
          error,
          "Suggestion selection cancelled.",
          "Commit analysis failed because of an unexpected error.",
          dependencies,
        );
      }
    });

  return program;
}

export async function runCli(argv = process.argv): Promise<void> {
  loadProjectEnvironment();
  await createProgram().parseAsync(argv);
}

function resolveEntryPath(filePath: string): string {
  try {
    return realpathSync(path.resolve(filePath));
  } catch {
    return path.resolve(filePath);
  }
}

const entryPath = process.argv[1]
  ? resolveEntryPath(process.argv[1])
  : undefined;
if (
  entryPath !== undefined &&
  resolveEntryPath(fileURLToPath(import.meta.url)) === entryPath
) {
  await runCli();
}
