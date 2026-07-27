# smart-commit

`smart-commit` is a staged Git change inspection CLI. Phase 1 is deliberately
read-only: it reports files and statistics from Git's index and can display the
full staged diff. It does not stage files, create commits, push changes, contact
network services, or read API keys.

## Requirements and installation

Install Node.js 22 or newer and Git, then install and build the project:

```sh
npm install
npm run build
npm link
```

The executable is then available as `smart-commit`.

## Development commands

```sh
npm run dev -- inspect
npm run build
npm test
```

## Usage

Inspect staged filenames and statistics, then choose whether to display the
diff:

```sh
smart-commit inspect
```

Display the diff immediately:

```sh
smart-commit inspect --show-diff
```

Print the validated analysis as JSON without an interactive prompt:

```sh
smart-commit inspect --json
```

Only changes already staged in Git are inspected. Unstaged and untracked files
are not included.

## Package responsibilities

- `commander` defines the `inspect` command, parses options, validates conflicting
  flags, and generates help.
- `execa` invokes the installed `git` executable with argument arrays and no
  shell command construction.
- `@inquirer/prompts` asks whether the developer wants to display the full diff.
- `zod` validates the staged-change analysis before it reaches text or JSON
  output.
- `typescript` type-checks and builds the CLI.
- `tsx` runs the TypeScript entry point during development.
- `@types/node` supplies Node.js runtime types.
- `vitest` runs isolated unit tests and command-runner mocks.

## Current limitations

Phase 1 only inspects the current staged snapshot. It does not generate commit
messages, detect mixed concerns, alter the index, create commits, push, use an
LLM, or make network requests. Git must already be installed and available on
`PATH`.

## Planned phases

- Phase 2 will add deterministic mock suggestions and an interactive review
  flow, still without a real model or Git mutation.
- Phase 3 plans an opt-in local Ollama provider with explicit safety boundaries.
- Phase 4 plans opt-in OpenAI and Gemini adapters with explicit cloud disclosure
  and credential handling.
- Phase 5 plans mixed-change detection and atomic-commit recommendations without
  silently changing the staging area.

None of the provider phases are implemented or installed in Phase 1.
