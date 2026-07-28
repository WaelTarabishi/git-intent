# Git Intent

Git Intent is a read-only staged-change inspection and commit-analysis CLI.
Phase 3 can generate structured suggestions with either the deterministic mock
provider or a locally running Ollama model. It never stages files, creates
commits, pushes, reads cloud API keys, or calls OpenAI or Gemini.

## Requirements and installation

Install Node.js 22 or newer and Git, then install and build the project:

```sh
npm install
npm run build
npm link
```

The executable is available as `git-intent`. The existing `smart-commit`
executable remains as a compatibility alias.

Ollama is an optional external prerequisite. It is needed only for
`--provider ollama`; see [docs/OLLAMA.md](docs/OLLAMA.md) for platform
installation links and local-model setup.

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

Analyze it with a local Ollama model:

```sh
ollama pull qwen2.5-coder:7b
git-intent suggest --provider ollama
git-intent suggest --provider ollama --json
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

### Ollama configuration

The default endpoint is `http://localhost:11434`, the default model is
`qwen2.5-coder:7b`, and the default request timeout is 120 seconds.

| Setting | Environment variable | CLI override |
| --- | --- | --- |
| Ollama base URL | `GIT_INTENT_OLLAMA_URL` | `--ollama-url <url>` |
| Model | `GIT_INTENT_OLLAMA_MODEL` | `--model <model>` |
| Timeout in milliseconds | `GIT_INTENT_OLLAMA_TIMEOUT_MS` | `--ollama-timeout <milliseconds>` |

Precedence is CLI option, then environment variable, then the documented
default. For example:

```sh
GIT_INTENT_OLLAMA_MODEL=qwen2.5-coder:3b git-intent suggest --provider ollama
git-intent suggest --provider ollama --model qwen2.5-coder:7b
git-intent suggest --provider ollama --ollama-url http://127.0.0.1:11434
```

The Ollama provider refuses known cloud-model names and direct `ollama.com`
endpoints. A custom endpoint can still be remote, so verify that it is controlled
by you before analyzing sensitive work.

## Structured provider response

Every provider result passes through the same Zod schema. The response contains:

- A staged-change summary.
- A split recommendation and optional reason.
- Between one and three suggestions.
- A Conventional Commit type, optional scope, description, explanation, and
  confidence score from 0 through 1 for every suggestion.

The accepted Conventional Commit types are `build`, `chore`, `ci`, `docs`,
`feat`, `fix`, `perf`, `refactor`, `revert`, `style`, and `test`.

## Phase 3 architecture

- The Git layer performs read-only staged inspection and returns neutral staged
  change data.
- A provider receives that data through the common `CommitAnalysisProvider`
  interface.
- The mock provider returns deterministic local data and performs no I/O.
- The Ollama provider owns environment configuration, local HTTP communication,
  timeouts, error mapping, response parsing, and Zod validation.
- A dedicated prompt module owns the instructions, JSON Schema, filenames,
  recent commit context, and untrusted staged-diff delimiters.
- An isolated safety module detects sensitive filenames for warnings and can
  support stricter provider policies later.
- The shared validation layer treats provider output as untrusted at runtime.
- The UI formats only validated suggestions.
- The CLI selects a provider by identifier and contains no provider-specific
  request logic.

Both providers implement the same `CommitAnalysisProvider` interface. The CLI
contains no Ollama HTTP or response-parsing logic.

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

## Privacy and safety limitations

The Ollama provider sends changed filenames, up to five recent commit subjects,
and the complete staged diff to the configured Ollama endpoint. The request is
rejected when the diff exceeds 100,000 characters; Git Intent does not silently
truncate it. Stage fewer related changes before retrying.

Recognizable `.env`, private-key, credential, Terraform state, and secret
manifest filenames produce a warning but are not automatically blocked because
the provider is local by default. Filename detection is heuristic and does not
inspect or redact every possible secret. Local processing reduces cloud
exposure, but it does not guarantee complete security: the endpoint may be
remote, the model/runtime may log data, aliases may conceal offloading behavior,
and sensitive content may exist in ordinary-looking files.

Model output can still be inaccurate. Git Intent validates its structure, but
the developer must review the meaning of every suggestion. Binary patches also
consume the same character limit and may not be meaningfully understood by the
model.

## Planned phases

- Phase 4 may add explicitly opt-in cloud providers with disclosure and
  credential handling. OpenAI and Gemini are not implemented in this phase.
- Phase 5 plans mixed-change detection and atomic-commit recommendations without
  silently changing the staging area.
