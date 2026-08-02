# Git Intent

Git Intent inspects staged changes and generates structured commit suggestions
with either a locally running Ollama model or Google Gemini. Interactive
generation creates the chosen commit locally, then separately asks whether to
push it. Inspection and JSON analysis remain read-only.

## Requirements and installation

Install Node.js 22 or newer and Git, then install and build the project:

```sh
npm install
npm run build
npm link
```

The executable is available as `git-intent`. The existing `smart-commit`
executable remains as a compatibility alias.

For local analysis, install Ollama and see [docs/OLLAMA.md](docs/OLLAMA.md).
For cloud analysis, create a Gemini API key and see
[docs/GEMINI.md](docs/GEMINI.md). Neither provider is required for `inspect`.

Gemini users can run the built-in one-time setup from any directory. The input
is masked and the saved key is automatically available to every project:

```sh
git-intent config set-gemini-key
```

## Development commands

```sh
npm run dev -- inspect
npm run dev -- suggest
npm run build
npm test
```

## Terminal themes

In a real terminal, `suggest` opens a responsive interactive interface with a
live animated analysis indicator, elapsed time, keyboard navigation, confidence
scores, and an updating commit preview. The provider's recommended suggestion
starts selected.

```text
╭──────────────────────────────────────────────────────────────╮
│ ◆ Git Intent                           Gemini · Aurora theme │
╰──────────────────────────────────────────────────────────────╯

  ✓ 12 staged files · 5 recent subjects · Analyzed with Gemini   4.2s

  Suggested commit

  ❯ ★ feat(cli): improve commit selection                        96%
      refactor(ui): simplify terminal rendering                  81%

  [Enter Use #1] [C Write custom] [Esc Cancel]
  ↑↓ or J/K move · active commit is underlined
```

Click a suggestion to select it; click the selected suggestion again to accept
it. The Use, Write custom, and Cancel actions remain directly below the
suggestions and are clickable in terminals that support SGR mouse events. The
active subject is underlined, and every row keeps the same width while the
selection moves. With the keyboard, use `↑` and `↓` to navigate (`J` and `K`
also work), `Enter` to accept, `C` to write a custom message, and `Esc` or
`Ctrl+C` to cancel. The selection screen does not scroll. Long subjects wrap
without losing text, and the details panel shows every generated implementation
detail, test note, and breaking change. Disable motion while keeping the
interactive screen with `--no-animation`:

```sh
git-intent suggest --no-animation
```

Interactive output uses a colorful semantic theme for headings, file statuses,
statistics, recommendations, confidence, warnings, errors, commits, and pushes.
The default `aurora` palette is the most vibrant. Choose a palette independently
for either command:

```sh
git-intent inspect --theme aurora
git-intent suggest --theme sunset
git-intent suggest --theme ocean
git-intent inspect --theme mono
```

Available themes are `aurora`, `sunset`, `ocean`, and `mono`. Disable ANSI
styling explicitly with `--no-color`:

```sh
git-intent inspect --no-color
git-intent suggest --no-color
```

Colors are also suppressed automatically when the output stream does not
support them or when `NO_COLOR` is set. JSON output remains valid JSON and does
not contain terminal styling. Piped and other non-TTY use keeps the plain prompt
flow for compatibility instead of emitting animation control sequences.

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

## Create and optionally push a suggested commit

Pull at least one Ollama model, stage your changes, and start the interactive
flow:

```sh
ollama pull qwen2.5-coder:7b
git add <files>
git-intent generate
```

`generate` is an alias of `suggest` and accepts the same options.
The command first asks you to select a provider. Ollama also loads the models
installed in the selected server and asks you to choose one. Gemini uses its
configured model or the documented default.

The interactive command displays the provider summary, warns if the validated
response recommends splitting, and presents a compact list of between one and
three commit subjects. The provider's recommended suggestion appears first.
Only the chosen suggestion expands into a detailed preview with its
implementation details, test changes, breaking changes, explanation, and
confidence. The developer can accept the preview, return to the compact list,
or enter a custom message. Accepting a message creates a local commit from the
currently staged changes. Git Intent then asks separately whether to push,
defaulting to No. A branch without an upstream can be pushed to a selected
configured remote and have that upstream established.

For automation or inspection, return only the complete validated provider
response:

```sh
git-intent generate \
  --provider ollama \
  --model qwen2.5-coder:7b \
  --json
```

JSON mode never opens an interactive prompt, creates a commit, or pushes.
Errors are written to standard error, so successful standard output is one
valid JSON document.

Only changes already staged in Git are inspected. Unstaged and untracked files
are not included. An empty staging area is rejected before a provider is called.

### Ollama configuration

The default endpoint is `http://localhost:11434`, the non-interactive fallback
model is `qwen2.5-coder:7b`, and the default request timeout is 120 seconds.

| Setting | Environment variable | CLI override |
| --- | --- | --- |
| Ollama base URL | `GIT_INTENT_OLLAMA_URL` | `--ollama-url <url>` |
| Model | `GIT_INTENT_OLLAMA_MODEL` | `--model <model>` |
| Timeout in milliseconds | `GIT_INTENT_OLLAMA_TIMEOUT_MS` | `--ollama-timeout <milliseconds>` |

In interactive mode, omitting `--model` opens the installed-model selector.
Providing `--model` skips that selector. In non-interactive JSON mode,
precedence is CLI option, then environment variable, then the documented
fallback. For example:

```sh
GIT_INTENT_OLLAMA_MODEL=qwen2.5-coder:3b git-intent suggest --provider ollama
git-intent suggest --provider ollama --model qwen2.5-coder:7b
git-intent suggest --provider ollama --ollama-url http://127.0.0.1:11434
```

The Ollama provider refuses known cloud-model names and direct `ollama.com`
endpoints. A custom endpoint can still be remote, so verify that it is controlled
by you before analyzing sensitive work.

### Gemini configuration

Create an API key in
[Google AI Studio](https://aistudio.google.com/app/apikey), then expose it to
the process through `GEMINI_API_KEY`. `GOOGLE_API_KEY` is also supported and
takes precedence when both variables are set. Do not pass keys on the command
line or commit them to Git.

The recommended one-time setup works across all projects and masks the key as
you type:

```sh
git-intent config set-gemini-key
```

On Windows, use `Shift+Insert` if `Ctrl+V` does not paste into the masked
prompt. A clipboard-to-stdin fallback is also available and keeps the key out
of command history and process arguments:

```powershell
Get-Clipboard -Raw | git-intent config set-gemini-key --stdin
```

This saves the key in `~/.git-intent/.env` with owner-only file permissions
where the operating system supports them. The CLI automatically loads that
file on startup.

For project-specific configuration, the CLI also loads `.env` from the
directory where it is run. Copy the included example and replace the
placeholder:

```powershell
Copy-Item .env.example .env
```

```env
GEMINI_API_KEY=your-api-key
```

`.env` is already ignored by Git. Configuration precedence is an environment
variable already set by the shell, the current project's `.env`, then the
user-wide `~/.git-intent/.env` file.

The default model is `gemini-3.6-flash`, and the default timeout is 120 seconds.

| Setting | Environment variable | CLI override |
| --- | --- | --- |
| API key | `GEMINI_API_KEY` or `GOOGLE_API_KEY` | None |
| Model | `GIT_INTENT_GEMINI_MODEL` | `--model <model>` |
| Timeout in milliseconds | `GIT_INTENT_GEMINI_TIMEOUT_MS` | `--gemini-timeout <milliseconds>` |

PowerShell:

```powershell
$env:GEMINI_API_KEY = "your-api-key"
git-intent suggest --provider gemini
```

Bash:

```sh
export GEMINI_API_KEY="your-api-key"
git-intent suggest --provider gemini
```

For non-interactive JSON output:

```sh
git-intent suggest \
  --provider gemini \
  --model gemini-3.6-flash \
  --json
```

Gemini is a cloud provider. Selecting it sends changed filenames, up to five
recent commit subjects, and the staged diff to Google. Git Intent prints that
disclosure and any sensitive-filename warning to standard error, including in
JSON mode.

## Structured provider response

Every provider result passes through the same Zod schema. The response contains:

- A staged-change summary.
- A split recommendation and optional reason.
- Exactly three distinct suggestions for comparison.
- The zero-based index of the provider's recommended suggestion.
- A Conventional Commit type, optional scope, description, one to six
  implementation details, test details, breaking changes, explanation, and
  confidence score from 0 through 1 for every suggestion.

The accepted Conventional Commit types are `build`, `chore`, `ci`, `docs`,
`feat`, `fix`, `perf`, `refactor`, `revert`, `style`, and `test`.

## Phase 3 architecture

- The Git layer performs read-only staged inspection and returns neutral staged
  change data.
- A provider receives that data through the common `CommitAnalysisProvider`
  interface.
- Each provider owns its environment configuration, HTTP communication,
  timeouts, error mapping, response parsing, and Zod validation.
- The Ollama model discovery layer reads `/api/tags` and exposes installed
  local models to the interactive selector.
- A dedicated prompt module owns the instructions, JSON Schema, filenames,
  recent commit context, and untrusted staged-diff delimiters.
- An isolated safety module detects sensitive filenames for warnings and can
  support stricter provider policies later.
- The shared validation layer treats provider output as untrusted at runtime.
- The UI formats only validated suggestions.
- The CLI selects a provider and installed model without owning HTTP request
  logic.

The CLI contains no provider HTTP or response-parsing logic.

## Package responsibilities

- `commander` defines `inspect` and `suggest`, validates options, and generates
  help.
- `execa` invokes the installed `git` executable with argument arrays and no
  shell command construction.
- `@inquirer/prompts` handles provider, model, suggestion, and custom-message
  selection in the plain fallback flow.
- `ink` and `react` render the responsive animated suggestion interface in a
  real terminal.
- `zod` validates staged-change data and provider responses before output.
- `typescript` type-checks and builds the CLI.
- `tsx` runs the TypeScript entry point during development.
- `@types/node` supplies Node.js runtime types.
- `@types/react` supplies the JSX and React component types used by the TUI.
- `vitest` runs unit, CLI, and Git integration tests.

## Privacy and safety limitations

Both providers send changed filenames, up to five recent commit subjects, and
the staged diff to their configured endpoints. Generated dependency-lockfile
bodies are replaced with addition/deletion summaries before sending so they do
not dominate the analysis. The remaining diff is rejected when it exceeds
100,000 characters; Git Intent does not silently truncate source changes. Stage
fewer related changes before retrying.

Recognizable `.env`, private-key, credential, Terraform state, and secret
manifest filenames produce a warning but are not automatically blocked.
Filename detection is heuristic and does not inspect or redact every possible
secret. Ollama processing reduces cloud exposure when its endpoint is genuinely
local. Gemini sends staged content to Google. Sensitive content may also exist
in ordinary-looking files, so review the staged diff before choosing a provider.

Model output can still be inaccurate. Git Intent validates its structure, but
the developer must review the meaning of every suggestion. Binary patches also
consume the same character limit and may not be meaningfully understood by the
model.

## Planned phases

- A future phase may add other explicitly selected cloud providers.
- Phase 5 plans mixed-change detection and atomic-commit recommendations without
  silently changing the staging area.
