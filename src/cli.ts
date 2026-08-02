#!/usr/bin/env node

import {
  confirm as confirmPrompt,
  input as inputPrompt,
  password as passwordPrompt,
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
import {
  loadGitIntentEnvironment,
  saveGlobalGeminiApiKey,
} from "./config/environment.js";
import {
  DetachedHeadError,
  GitService,
} from "./git/git-service.js";
import type {
  GitPushContext,
  StagedChangeAnalysis,
} from "./git/git-types.js";
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
  formatCommitSuggestionPreview,
  formatStyledConventionalCommitSubject,
} from "./ui/suggestion-view.js";
import type {
  SuggestionTuiOptions,
  SuggestionTuiResult,
} from "./ui/suggestion-tui.js";
import {
  createTheme,
  defaultThemeName,
  terminalColorsEnabled,
  themeNames,
  type TerminalTheme,
  type ThemeName,
} from "./ui/theme.js";
import { waitForInteractiveResult } from "./ui/interaction-lifecycle.js";

interface InspectOptions {
  json?: boolean;
  showDiff?: boolean;
  theme?: ThemeName;
  color?: boolean;
}

interface SuggestOptions {
  json?: boolean;
  provider?: ProviderId;
  ollamaUrl?: string;
  model?: string;
  ollamaTimeout?: number;
  geminiTimeout?: number;
  theme?: ThemeName;
  color?: boolean;
  animation?: boolean;
}

interface SetGeminiKeyOptions extends Pick<InspectOptions, "theme" | "color"> {
  stdin?: boolean;
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
  createCommit(message: string): Promise<string>;
  getPushContext(): Promise<GitPushContext>;
  pushCurrentBranch(
    context: GitPushContext,
    remote?: string,
  ): Promise<void>;
  isInteractiveTerminal(): boolean;
  runSuggestionTui(
    options: SuggestionTuiOptions,
  ): Promise<SuggestionTuiResult>;
  confirm(options: { message: string; default?: boolean }): Promise<boolean>;
  select(options: {
    message: string;
    choices: readonly SelectChoice[];
  }): Promise<string>;
  input(options: {
    message: string;
    validate(value: string): boolean | string;
  }): Promise<string>;
  readStdin(): Promise<string>;
  password(options: {
    message: string;
    mask?: boolean | string;
    validate(value: string): boolean | string;
  }): Promise<string>;
  saveGeminiApiKey(apiKey: string): Promise<string>;
  writeOutput(value: string): void;
  writeError(value: string): void;
  setExitCode(value: number): void;
}

const defaultDependencies: CliDependencies = {
  inspectStagedChanges: async () => new GitService().inspectStagedChanges(),
  resolveProvider: createProvider,
  listProviderModels,
  createCommit: async (message) => new GitService().createCommit(message),
  getPushContext: async () => new GitService().getPushContext(),
  pushCurrentBranch: async (context, remote) =>
    new GitService().pushCurrentBranch(context, remote),
  isInteractiveTerminal: () =>
    process.stdin.isTTY === true && process.stdout.isTTY === true,
  runSuggestionTui: async (options) => {
    const { runSuggestionTui } = await import(
      "./ui/suggestion-tui.js"
    );
    return runSuggestionTui(options);
  },
  confirm: async (options) => confirmPrompt(options),
  select: async (options) => selectPrompt(options),
  input: async (options) => inputPrompt(options),
  readStdin: async () => {
    process.stdin.setEncoding("utf8");
    const chunks: string[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    return chunks.join("");
  },
  password: async (options) => passwordPrompt(options),
  saveGeminiApiKey: saveGlobalGeminiApiKey,
  writeOutput: (value) => process.stdout.write(value),
  writeError: (value) => process.stderr.write(value),
  setExitCode: (value) => {
    process.exitCode = value;
  },
};

function addAppearanceOptions(command: Command): Command {
  return command
    .addOption(
      new Option("--theme <theme>", "terminal color theme")
        .choices([...themeNames])
        .default(defaultThemeName),
    )
    .option("--no-color", "disable ANSI colors and text styling");
}

function resolveTheme(
  options: Pick<InspectOptions, "theme" | "color">,
  stream: NodeJS.WritableStream = process.stdout,
): TerminalTheme {
  const name = options.theme ?? defaultThemeName;
  return options.color === false
    ? createTheme(name, { color: false, stream })
    : createTheme(name, { stream });
}

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
  theme: TerminalTheme,
  dependencies: CliDependencies,
): Promise<void> {
  if (options.json === true) {
    dependencies.writeOutput(`${JSON.stringify(analysis, null, 2)}\n`);
    return;
  }

  dependencies.writeOutput(`${formatInspection(analysis, theme)}\n`);

  if (options.showDiff === true) {
    dependencies.writeOutput(`${formatFullDiff(analysis.diff, theme)}\n`);
    return;
  }

  const shouldShowDiff = await dependencies.confirm({
    message: "Display the full staged diff?",
    default: false,
  });

  if (shouldShowDiff) {
    dependencies.writeOutput(`${formatFullDiff(analysis.diff, theme)}\n`);
  }
}

async function requestCustomCommitMessage(
  dependencies: CliDependencies,
): Promise<string> {
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
  return selectedMessage;
}

async function resolveTuiCommitMessage(
  result: SuggestionTuiResult,
  analysis: CommitAnalysis,
  dependencies: CliDependencies,
): Promise<string> {
  if (result.kind === "custom") {
    return requestCustomCommitMessage(dependencies);
  }

  const suggestion = analysis.suggestions[result.suggestionIndex];
  if (suggestion === undefined) {
    throw new Error("The selected commit suggestion is not available.");
  }
  return formatConventionalCommitMessage(suggestion);
}

async function displaySuggestionSelection(
  analysis: CommitAnalysis,
  theme: TerminalTheme,
  dependencies: CliDependencies,
): Promise<string> {
  dependencies.writeOutput(`${formatCommitAnalysis(analysis, theme)}\n`);

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
        recommended
          ? `${theme.success("★ Recommended")}  `
          : `${theme.secondary("✦ Alternative")}  `
      }${formatStyledConventionalCommitSubject(suggestion, theme)}`,
      value: `suggestion:${index}`,
      description: theme.confidence(
        suggestion.confidence,
        `${Math.round(suggestion.confidence * 100)}% confidence`,
      ),
    };
  });
  choices.push({
    name: theme.accent("✎ Enter a custom message"),
    value: "custom",
    description: "Create the commit with your own message.",
  });

  while (true) {
    const selection = await dependencies.select({
      message: "Choose a commit message to preview:",
      choices,
    });

    if (selection === "custom") {
      return requestCustomCommitMessage(dependencies);
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
        theme,
      )}\n`,
    );
    const useSuggestion = await dependencies.confirm({
      message: "Use this commit message?",
      default: true,
    });
    if (useSuggestion) {
      return formatConventionalCommitMessage(suggestion);
    }

    dependencies.writeOutput(
      `\n${theme.info("↻ Choose another suggestion.")}\n`,
    );
  }
}

function pushTarget(
  context: GitPushContext,
  remote?: string,
): string {
  return context.upstream ?? `${remote}/${context.branch}`;
}

async function offerPush(
  commitHash: string,
  theme: TerminalTheme,
  dependencies: CliDependencies,
): Promise<void> {
  let context: GitPushContext;
  try {
    context = await dependencies.getPushContext();
  } catch (error) {
    if (error instanceof DetachedHeadError) {
      dependencies.writeOutput(`${theme.warning(error.message)}\n`);
      return;
    }
    throw error;
  }

  if (context.upstream !== undefined) {
    const shouldPush = await dependencies.confirm({
      message: `Push ${commitHash} to ${context.upstream}?`,
      default: false,
    });
    if (!shouldPush) {
      dependencies.writeOutput(
        `${theme.warning("Commit kept locally; nothing was pushed.")}\n`,
      );
      return;
    }

    await dependencies.pushCurrentBranch(context);
    dependencies.writeOutput(
      `${theme.success(`Pushed ${commitHash} to ${context.upstream}.`)}\n`,
    );
    return;
  }

  if (context.remotes.length === 0) {
    dependencies.writeOutput(
      `${theme.warning(
        "Commit created locally. No Git remote is configured, so nothing was pushed.",
      )}\n`,
    );
    return;
  }

  let remote: string;
  if (context.remotes.length === 1) {
    remote = context.remotes[0]!;
  } else {
    const selection = await dependencies.select({
      message: "Select a remote for this branch:",
      choices: [
        {
          name: "Keep the commit local",
          value: "local",
          description: "Do not push anything.",
        },
        ...context.remotes.map((candidate) => ({
          name: `${candidate}/${context.branch}`,
          value: `remote:${candidate}`,
          description: "Push and configure this branch's upstream.",
        })),
      ],
    });
    if (selection === "local") {
      dependencies.writeOutput(
        `${theme.warning("Commit kept locally; nothing was pushed.")}\n`,
      );
      return;
    }
    remote = selection.replace("remote:", "");
    if (!context.remotes.includes(remote)) {
      throw new Error("The selected Git remote is not available.");
    }
  }

  const target = pushTarget(context, remote);
  const shouldPush = await dependencies.confirm({
    message: `Push ${commitHash} to ${target} and set it as upstream?`,
    default: false,
  });
  if (!shouldPush) {
    dependencies.writeOutput(
      `${theme.warning("Commit kept locally; nothing was pushed.")}\n`,
    );
    return;
  }

  await dependencies.pushCurrentBranch(context, remote);
  dependencies.writeOutput(
    `${theme.success(`Pushed ${commitHash} to ${target}.`)}\n`,
  );
}

async function createCommitAndOfferPush(
  message: string,
  theme: TerminalTheme,
  dependencies: CliDependencies,
): Promise<void> {
  dependencies.writeOutput(`${theme.info("Creating local commit...")}\n`);
  const commitHash = await dependencies.createCommit(message);
  dependencies.writeOutput(
    `${theme.success(`Created commit ${commitHash}.`)}\n`,
  );
  try {
    await offerPush(commitHash, theme, dependencies);
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "The push step failed.";
    throw new Error(
      `Commit ${commitHash} was created locally, but it was not pushed. ${detail}`,
      { cause: error },
    );
  }
}

function reportActionError(
  error: unknown,
  cancellationMessage: string,
  fallbackMessage: string,
  theme: TerminalTheme,
  dependencies: CliDependencies,
): void {
  if (isPromptCancellation(error)) {
    dependencies.writeError(`${theme.warning(cancellationMessage)}\n`);
    return;
  }

  const message = error instanceof Error ? error.message : fallbackMessage;
  dependencies.writeError(`${theme.danger(`Error: ${message}`)}\n`);
  dependencies.setExitCode(1);
}

export function createProgram(
  dependencyOverrides: Partial<CliDependencies> = {},
): Command {
  const dependencies = { ...defaultDependencies, ...dependencyOverrides };
  let activeTheme = createTheme();
  if (dependencyOverrides.resolveProvider === undefined) {
    dependencies.resolveProvider = (providerId, options) =>
      createProvider(providerId, {
        ...options,
        onWarning: (message) =>
          dependencies.writeError(
            `${activeTheme.warning(`Warning: ${message}`)}\n`,
          ),
      });
  }
  const program = new Command();

  program
    .name("git-intent")
    .description(
      "Inspect staged changes, generate a commit message, and optionally push.",
    )
    .version("0.1.0")
    .showHelpAfterError();

  const configCommand = program
    .command("config")
    .description("Manage user-wide Git Intent configuration.");

  const setGeminiKeyCommand = configCommand
    .command("set-gemini-key")
    .description("Securely save a Gemini API key for all projects.")
    .option(
      "--stdin",
      "read the API key from standard input instead of opening a prompt",
    );
  addAppearanceOptions(setGeminiKeyCommand).action(
    async (options: SetGeminiKeyOptions) => {
      const theme = resolveTheme(options);
      activeTheme = theme;
      try {
        if (options.stdin !== true && !dependencies.isInteractiveTerminal()) {
          throw new Error(
            "This command requires an interactive terminal. Pipe the key to `git-intent config set-gemini-key --stdin` when a prompt is unavailable.",
          );
        }

        const apiKey =
          options.stdin === true
            ? await dependencies.readStdin()
            : await dependencies.password({
                message:
                  "Gemini API key (use Shift+Insert if Ctrl+V does not paste):",
                mask: "*",
                validate: (value) =>
                  value.trim().length > 0 || "Enter a Gemini API key.",
              });
        const environmentFile = await dependencies.saveGeminiApiKey(apiKey);
        dependencies.writeOutput(
          `${theme.success(`Saved the Gemini API key for all projects in ${environmentFile}.`)}\n`,
        );
      } catch (error) {
        reportActionError(
          error,
          "Gemini configuration cancelled.",
          "Gemini configuration failed because of an unexpected error.",
          theme,
          dependencies,
        );
      }
    },
  );

  const inspectCommand = program
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
    );
  addAppearanceOptions(inspectCommand).action(async (options: InspectOptions) => {
    const theme = resolveTheme(options);
    activeTheme = theme;
    try {
      const unvalidatedAnalysis = await dependencies.inspectStagedChanges();
      const analysis = validateStagedChangeAnalysis(unvalidatedAnalysis);
      await displayInspection(analysis, options, theme, dependencies);
    } catch (error) {
      reportActionError(
        error,
        "Inspection cancelled.",
        "Inspection failed because of an unexpected error.",
        theme,
        dependencies,
      );
    }
  });

  const suggestCommand = program
    .command("suggest")
    .alias("generate")
    .description(
      "Analyze staged changes with a provider and review commit suggestions.",
    )
    .option(
      "--json",
      "print only the complete validated provider response as JSON",
    )
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
    .option("--no-animation", "disable animated terminal updates");
  addAppearanceOptions(suggestCommand).action(async (options: SuggestOptions) => {
    const theme = resolveTheme(options);
    activeTheme = theme;
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

      const useTui =
        options.json !== true && dependencies.isInteractiveTerminal();
      if (
        options.json !== true &&
        !useTui &&
        provider.progressMessage !== undefined
      ) {
        dependencies.writeOutput(
          `${theme.info(`◌ ${provider.progressMessage}`)}\n`,
        );
      }

      const startedAtMs = Date.now();
      const commitAnalysisPromise = provider
        .analyze({ stagedChanges })
        .then((analysis) => validateCommitAnalysis(analysis));
      // Ink subscribes to this promise from an effect. Providers can reject
      // before that effect runs (for example, on an oversized diff), so attach
      // a handler immediately while preserving the rejection for the UI/CLI.
      void commitAnalysisPromise.catch(() => undefined);

      if (options.json === true) {
        const commitAnalysis = await commitAnalysisPromise;
        dependencies.writeOutput(
          `${JSON.stringify(commitAnalysis, null, 2)}\n`,
        );
        return;
      }

      let selectedMessage: string;
      if (useTui) {
        const providerName = providerPresentation(
          selectedProvider.providerId,
        ).displayName.replace(/\s+\(.+\)$/u, "");
        const result = await dependencies.runSuggestionTui({
          analysisPromise: commitAnalysisPromise,
          animation: options.animation !== false,
          colorsEnabled: terminalColorsEnabled(options.color),
          fileCount: stagedChanges.files.length,
          providerName,
          recentCommitCount:
            stagedChanges.recentCommitMessages?.length ?? 0,
          startedAtMs,
          themeName: options.theme ?? defaultThemeName,
        });
        const commitAnalysis = await commitAnalysisPromise;
        selectedMessage = await resolveTuiCommitMessage(
          result,
          commitAnalysis,
          dependencies,
        );
      } else {
        const commitAnalysis = await commitAnalysisPromise;
        selectedMessage = await displaySuggestionSelection(
          commitAnalysis,
          theme,
          dependencies,
        );
      }

      await createCommitAndOfferPush(
        selectedMessage,
        theme,
        dependencies,
      );
    } catch (error) {
      reportActionError(
        error,
        "Suggestion selection cancelled.",
        "Commit analysis failed because of an unexpected error.",
        theme,
        dependencies,
      );
    }
  });

  return program;
}

export async function waitForCliRun<T>(
  cliPromise: Promise<T>,
  interactive: boolean,
): Promise<T> {
  if (interactive) {
    return waitForInteractiveResult(cliPromise);
  }
  return cliPromise;
}

export async function runCli(argv = process.argv): Promise<void> {
  loadGitIntentEnvironment();
  await waitForCliRun(
    createProgram().parseAsync(argv),
    process.stdin.isTTY === true && process.stdout.isTTY === true,
  );
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
