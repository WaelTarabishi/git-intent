# Local Ollama provider

## What Ollama is and why it comes first

[Ollama](https://docs.ollama.com/) is a separate application that downloads and
runs language models and exposes an HTTP API. Git Intent uses it before any
cloud-provider phase so a developer can evaluate real model suggestions while
keeping the default data path on the same computer.

Git Intent uses Node.js `fetch` directly. It does not install an Ollama npm
client, manage the Ollama process, download models automatically, use cloud API
keys, or fall back to a cloud provider.

## Prerequisites and setup

Install Ollama for
[Windows](https://docs.ollama.com/windows),
[macOS](https://docs.ollama.com/macos), or
[Linux](https://docs.ollama.com/linux). Model downloads need additional disk
space and inference speed depends heavily on available CPU, memory, and GPU
resources.

Pull the default code-oriented model:

```sh
ollama pull qwen2.5-coder:7b
```

Start the server if the platform installation did not start it automatically:

```sh
ollama serve
```

Confirm the CLI and local server are available:

```sh
ollama -v
ollama ls
curl http://localhost:11434/api/tags
```

The [Ollama CLI reference](https://docs.ollama.com/cli) documents `pull`,
`serve`, and `ls`. The default model is documented in the
[Ollama model library](https://ollama.com/library/qwen2.5-coder:7b).

## Usage

Interactive review:

```sh
git-intent suggest --provider ollama
```

Machine-readable, non-interactive output:

```sh
git-intent suggest --provider ollama --json
```

Override configuration:

```sh
git-intent suggest --provider ollama \
  --ollama-url http://127.0.0.1:11434 \
  --model qwen2.5-coder:3b \
  --ollama-timeout 180000
```

Environment variables provide the same settings:

```sh
GIT_INTENT_OLLAMA_URL=http://localhost:11434
GIT_INTENT_OLLAMA_MODEL=qwen2.5-coder:7b
GIT_INTENT_OLLAMA_TIMEOUT_MS=120000
```

For URL, model, and timeout, precedence is:

```text
CLI option -> environment variable -> default
```

The URL and model variables requested for Phase 3 are
`GIT_INTENT_OLLAMA_URL` and `GIT_INTENT_OLLAMA_MODEL`. The timeout variable is
also supported because local model startup and hardware performance vary.

## Request and validation behavior

Git Intent sends a non-streaming `POST /api/generate` request using Ollama's
[structured-output support](https://docs.ollama.com/capabilities/structured-outputs).
The request asks Ollama to follow the JSON Schema generated from the same Zod
schema used by the rest of the application. The returned `response` string is
still parsed as untrusted JSON and independently validated with Zod.

The prompt includes:

- Changed filenames, statuses, rename context, and binary markers.
- The complete staged diff.
- Up to five recent commit subjects when Git history is available.
- Conventional Commit rules and one-to-three-suggestion limits.
- Split guidance for unrelated concerns.
- Instructions not to invent changes.
- Explicit boundaries identifying filenames, commit messages, comments, and
  diff contents as untrusted data rather than model instructions.

## Privacy and safety

The default URL is loopback-only, and the default model is locally downloadable.
Known Ollama cloud-model names and direct `ollama.com` API endpoints are
rejected. Git Intent does not read Ollama or cloud API keys.

The staged diff is limited to 100,000 characters. Oversized input is rejected
before any HTTP request and is never silently truncated. Stage fewer related
changes and retry.

Sensitive-looking filenames generate a warning for `.env` files, private keys,
credential files, Terraform state, and secret manifests. The local provider
does not automatically block them. This is intentional so the detection policy
can later become stricter for any separately approved cloud provider.

Local processing reduces cloud exposure but does not guarantee complete
security. In particular:

- A custom URL may point to another computer or network.
- A custom model alias may not reveal where inference happens.
- Ollama, a model, operating-system telemetry, or local logs may retain data.
- Filename heuristics cannot find all credentials or sensitive source content.
- Prompt-injection instructions reduce risk but cannot prove model obedience.

Review the configured endpoint, selected model, staged filenames, and diff
before running the provider on sensitive work.

## Troubleshooting

`Cannot reach Ollama`

- Install Ollama if `ollama -v` fails.
- Start it with `ollama serve` if the service is stopped.
- Check `curl http://localhost:11434/api/tags`.
- Verify `GIT_INTENT_OLLAMA_URL` or `--ollama-url`.

`Ollama model "... " is unavailable`

- Run `ollama pull <model>`.
- Confirm it appears in `ollama ls`.
- Ensure the configured model name and tag match exactly.

`Ollama did not respond within ...`

- Increase `--ollama-timeout` or `GIT_INTENT_OLLAMA_TIMEOUT_MS`.
- Try a smaller local model that fits the available hardware.
- Check the Ollama service logs for model-loading failures.

`invalid JSON` or `does not match the required schema`

- Retry once; local model output can vary.
- Confirm the model supports structured output well.
- Try the documented default model or another capable local code model.

`staged diff ... exceeding the ... safety limit`

- Stage fewer related files or hunks.
- Do not expect Git Intent to truncate the diff.

Errors are concise and go to standard error. `--json` prints no progress or
prompts and writes a JSON document to standard output only on success.
