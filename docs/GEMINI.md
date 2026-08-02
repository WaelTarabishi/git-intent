# Google Gemini provider

The Gemini provider sends staged-change context to Google's Gemini API and
returns the same validated commit-analysis structure as the local Ollama
provider.

## Configure an API key

Create or view a key in
[Google AI Studio](https://aistudio.google.com/app/apikey). Google recommends
configuring the key through `GEMINI_API_KEY` or `GOOGLE_API_KEY`. Git Intent
supports both and gives `GOOGLE_API_KEY` precedence when both are present.

Use Git Intent's one-time interactive setup to configure the key for every
project. The prompt masks the value, so the key is not placed in command
history or process arguments:

```sh
git-intent config set-gemini-key
```

The command stores the key in `~/.git-intent/.env`. Git Intent creates the file
with owner-only permissions on operating systems that support POSIX file modes
and automatically loads it each time the CLI starts.

Alternatively, the CLI loads a project-specific `.env` from the directory
where it is run:

```powershell
Copy-Item .env.example .env
```

Then edit `.env`:

```env
GEMINI_API_KEY=your-api-key
```

The repository's `.gitignore` excludes `.env` and `.env.*`, while keeping
`.env.example`. Never commit the real key. Configuration precedence is a
variable already set by the shell, the current project's `.env`, then the
user-wide `~/.git-intent/.env` file.

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

The key is sent in the `x-goog-api-key` request header. It is never placed in
the request URL or included in diagnostics. There is intentionally no API-key
CLI option because command-line arguments can be retained in shell history and
process listings. If no key is configured, the CLI directs the user to
`git-intent config set-gemini-key`.

## Model and timeout

The default model is `gemini-3.6-flash`.

```sh
git-intent suggest --provider gemini --model gemini-3.6-flash
git-intent suggest --provider gemini --gemini-timeout 180000
```

The equivalent environment variables are:

- `GIT_INTENT_GEMINI_MODEL`
- `GIT_INTENT_GEMINI_TIMEOUT_MS`

Configuration precedence is CLI option, provider-specific environment variable,
then default. The API key must always come from `GEMINI_API_KEY` or
`GOOGLE_API_KEY`.

## Privacy boundary

Gemini is an explicitly selected cloud provider. A request contains changed
filenames, up to five recent commit subjects, and the complete staged diff. Git
Intent emits a cloud disclosure before sending and an additional warning for
recognizable sensitive filenames. Warnings go to standard error so `--json`
standard output remains valid JSON.

The filename check is heuristic and does not redact content. Review the staged
diff yourself before using Gemini. Requests larger than 100,000 diff characters
are rejected before network communication.

## Errors

Git Intent maps missing or rejected credentials, rate limits, unavailable
models, timeouts, malformed responses, and schema-invalid model output to
actionable errors. Provider response bodies are not copied into errors, which
reduces the risk of reflecting credentials or remote diagnostic content.

See Google's official
[API-key guide](https://ai.google.dev/gemini-api/docs/api-key) and
[model guide](https://ai.google.dev/gemini-api/docs/models) for account,
restriction, quota, and current model details.
