# Installation Plan

This file records the dependency rationale and installation sequence through
Phase 3.

## Computer prerequisites

The initial development environment needs:

- A supported Node.js release and its bundled npm command.
- Git, available on the command path.
- A terminal capable of running the CLI and interactive prompts in later phases.

Ollama is required for commit analysis in Phase 3. It is not required for
staged-change inspection.

OpenAI and Gemini accounts or API keys are not required until their opt-in adapters are developed in Phase 4.

Before implementation, the project should choose an exact supported Node.js version range and eventually record it in package metadata and continuous-integration tests. That decision is intentionally not being made by modifying `package.json` now.

## Initial npm installation

From the project root, the proposed runtime dependency command is:

```sh
npm install commander execa @inquirer/prompts zod
```

The proposed development dependency command is:

```sh
npm install --save-dev typescript tsx @types/node vitest
```

These commands are not being executed as part of this documentation task.

## Why each initial package is included

| Package | Classification | Initial responsibility |
| --- | --- | --- |
| `commander` | Runtime dependency | Parse commands and options and produce CLI help and usage errors. |
| `execa` | Runtime dependency | Run Git with argument arrays and handle output, failures, cancellation, and timeouts. |
| `@inquirer/prompts` | Runtime dependency | Present suggestion selection and explicit confirmation prompts beginning in Phase 2. |
| `zod` | Runtime dependency | Validate unknown structured provider results at runtime beginning in Phase 2. |
| `typescript` | Development dependency | Type-check the source and define clear contracts between layers. |
| `tsx` | Development dependency | Run TypeScript directly during local development. |
| `@types/node` | Development dependency | Supply TypeScript declarations for Node.js APIs. |
| `vitest` | Development dependency | Run unit and integration tests with assertions and mocks. |

Some packages are installed initially even though their primary feature arrives in Phase 2. This keeps the agreed initial dependency set explicit; implementation should still proceed phase by phase.

## Environment variables without `dotenv`

Do not install `dotenv` initially.

The first phases do not need cloud secrets. When provider configuration arrives, the CLI can read values from `process.env`. During local development, supported Node.js versions can use native environment-file support, such as:

```sh
node --env-file=.env <compiled-cli-entry>
```

The actual package script and compiled entry path will be decided during implementation. A local environment file must be excluded from Git, and secrets must never be printed, placed in prompts, or captured in test snapshots.

Using native Node.js environment-variable support avoids an extra runtime dependency. `dotenv` can be reconsidered only if a concrete compatibility requirement appears.

## Deferred provider dependencies

Do not install OpenAI, Gemini, or Ollama npm libraries during the initial setup.

### Phase 3: Ollama

Ollama itself is an external program, installed separately by a developer who wants local models. The initial adapter should use Node.js native `fetch` to call Ollama's local HTTP API, so no Ollama npm package is currently proposed.

The project should document separately how to:

- Install and start Ollama.
- Obtain a supported model.
- Confirm the configured model exists.
- Override the local endpoint safely.

Phase 3 documents those steps in [OLLAMA.md](OLLAMA.md). The implemented default
model is `qwen2.5-coder:7b`, and Git Intent uses native `fetch` rather than an
Ollama npm dependency.

### Phase 4: OpenAI

When OpenAI adapter implementation begins, review the current official SDK, supported Node.js versions, and package release before installing it. The proposed command at that time is:

```sh
npm install openai
```

Do not run this command before the adapter phase needs it.

### Phase 4: Gemini

When Gemini adapter implementation begins, review the current official Google GenAI SDK and supported Node.js versions before installing it. The proposed command at that time is:

```sh
npm install @google/genai
```

Do not run this command before the adapter phase needs it.

Provider SDKs must remain inside their adapters. If native `fetch` is simpler and sufficiently maintainable at that future point, the team may decide not to install a provider SDK.

## Packages deliberately absent from the initial commands

- `dotenv`: native Node.js environment-variable support is sufficient initially.
- `openai`: deferred until the OpenAI adapter is implemented.
- `@google/genai`: deferred until the Gemini adapter is implemented.
- Any Ollama npm client: the Phase 3 design begins with Ollama as an external service and native HTTP calls.
- Git wrappers that replace the `git` executable: the project will invoke the installed Git tool through Execa.

## Recommended installation sequence when implementation is authorized

1. Confirm Node.js, npm, and Git versions.
2. Confirm a package manifest exists and review it before any install changes.
3. Run the proposed runtime installation command.
4. Run the proposed development installation command.
5. Review the resulting manifest and lockfile.
6. Begin Phase 1 only: TypeScript CLI setup and read-only staged Git inspection.
7. Do not add provider packages until the corresponding provider phase.

## Security checks for future setup

- Keep `.env` and provider credentials out of Git.
- Never accept API keys as ordinary CLI flags because terminal history and process listings may expose them.
- Avoid install scripts or packages that are not necessary.
- Review dependency changes and lockfile diffs.
- Treat staged source content as potentially sensitive before any cloud call.
- Make cloud-provider selection explicit; never silently fall back from Ollama to a cloud provider.
- Ensure Phase 1 contains no Git mutation command.
