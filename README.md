# Git Intent

Git Intent is a read-only staged-change inspection and commit-analysis CLI.
Phase 2 adds deterministic commit suggestions through a provider-independent
interface. It does not stage files, create commits, contact network services, or
read API keys.

## Requirements and installation

Install Node.js 22 or newer and Git, then install and build the project:

```sh
npm install
npm run build
npm link
```

The executable is available as `git-intent`. The existing `smart-commit`
executable remains as a compatibility alias.

## Development commands

```sh
npm run dev -- inspect
npm run dev -- suggest
npm run build
npm test
```

## Inspect staged changes

Inspect staged filenames and statistics, then choose whether to display the
diff:

```sh
git-intent inspect
```

Display the diff immediately:

```sh
git-intent inspect --show-diff
```

Print the validated staged-change analysis as JSON without prompting:

```sh
git-intent inspect --json
```

## Review commit suggestions

Analyze the staged snapshot with the deterministic mock provider:

```sh
git-intent suggest
git-intent suggest --provider mock
```

The interactive command displays the provider summary, warns if the validated
response recommends splitting, shows between one and three suggestions, and
lets the developer select a suggestion or enter a custom message. It only
prints the selected message. It never runs `git commit`.

For automation or inspection, return only the complete validated provider
response:

```sh
git-intent suggest --json
git-intent suggest --provider mock --json
```

JSON mode never opens an interactive prompt. Errors are written to standard
error, so successful standard output is one valid JSON document.

Only changes already staged in Git are inspected. Unstaged and untracked files
are not included. An empty staging area is rejected before a provider is called.

## Structured provider response

Every provider result passes through the same Zod schema. The response contains:

- A staged-change summary.
- A split recommendation and optional reason.
- Between one and three suggestions.
- A Conventional Commit type, optional scope, description, explanation, and
  confidence score from 0 through 1 for every suggestion.

The accepted Conventional Commit types are `build`, `chore`, `ci`, `docs`,
`feat`, `fix`, `perf`, `refactor`, `revert`, `style`, and `test`.

## Phase 2 architecture

- The Git layer performs read-only staged inspection and returns neutral staged
  change data.
- A provider receives that data through the common `CommitAnalysisProvider`
  interface.
- The mock provider returns deterministic local data and performs no I/O.
- The shared validation layer treats provider output as untrusted at runtime.
- The UI formats only validated suggestions.
- The CLI selects a provider by identifier and contains no provider-specific
  request logic.

Future Ollama, OpenAI, or Gemini adapters can implement the same provider
interface and be registered separately. They are not implemented, installed, or
called in Phase 2.

## Package responsibilities

- `commander` defines `inspect` and `suggest`, validates options, and generates
  help.
- `execa` invokes the installed `git` executable with argument arrays and no
  shell command construction.
- `@inquirer/prompts` handles suggestion selection and custom-message input.
- `zod` validates staged-change data and provider responses before output.
- `typescript` type-checks and builds the CLI.
- `tsx` runs the TypeScript entry point during development.
- `@types/node` supplies Node.js runtime types.
- `vitest` runs unit, CLI, and Git integration tests.

## Current limitations

Phase 2 uses deterministic mock suggestions; it does not claim semantic model
analysis. Git Intent does not alter the index, create commits, push, use an LLM,
make network requests, or read provider credentials.

## Planned phases

- Phase 3 plans an opt-in local Ollama adapter with explicit safety boundaries.
- Phase 4 plans opt-in OpenAI and Gemini adapters with cloud disclosure and
  credential handling.
- Phase 5 plans mixed-change detection and atomic-commit recommendations without
  silently changing the staging area.

None of those provider integrations or later-phase behaviors are included in
Phase 2.
