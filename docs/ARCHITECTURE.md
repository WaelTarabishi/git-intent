# Architecture

## Phase 3 scope

Phase 3 preserves the complete read-only review path and adds opt-in local model
analysis:

```text
Developer command
    -> CLI argument parsing
    -> staged Git inspection
    -> staged-change validation
    -> provider resolution
    -> provider-owned safety and analysis
    -> commit-analysis validation
    -> JSON output or interactive selection
    -> selected-message output
```

There is no commit layer in this phase. No implemented path stages files,
unstages files, creates a commit, pushes, contacts OpenAI or Gemini, or reads
cloud API keys. The Ollama adapter can make one HTTP request to its explicitly
configured endpoint.

## Layer boundaries

### CLI layer

The CLI defines the `inspect` and `suggest` commands and coordinates the other
layers. It:

- Parses and validates command options.
- Requests staged data through the Git inspection layer.
- Resolves a provider by its neutral identifier.
- Passes neutral URL, model, and timeout overrides to provider resolution.
- Displays a provider-declared progress message outside JSON mode.
- Validates every provider result before display.
- Chooses between JSON and interactive output.
- Reports errors to standard error.

The CLI does not parse Git output, implement provider-specific protocols, or run
`git commit`. It does not construct an Ollama request or parse an Ollama
response. Its dependencies are injectable so provider-interface usage and
non-interactive behavior can be tested without a real repository or terminal.

### Git layer

`GitService.inspectStagedChanges` remains the sole source of repository facts.
It invokes only read operations:

- Verify that Git is installed and the current directory is a work tree.
- Find the repository root.
- Read staged filenames and statuses.
- Read the staged diff and statistics.
- Read up to five recent commit subjects when history is available.
- Reject an empty staging area.

It normalizes additions, modifications, deletions, renames, copies, type
changes, unmerged entries, binary files, and unknown statuses. It does not call
`git add`, `git reset`, `git restore`, or `git commit`.

### Staged-change validation

The existing staged-change Zod schema checks the Git layer result before it is
passed to a provider. It verifies required file metadata, non-negative
statistics, and consistency between aggregate counts and the file collection.

### Provider layer

Every analysis provider implements the project-owned
`CommitAnalysisProvider` interface:

```ts
interface CommitAnalysisRequest {
  stagedChanges: ValidatedStagedChangeAnalysis;
}

interface CommitAnalysisProvider {
  readonly id: string;
  analyze(request: CommitAnalysisRequest): Promise<CommitAnalysis>;
}
```

The contract contains no Ollama, OpenAI, Gemini, HTTP, or SDK types. The CLI
knows only how to resolve a provider and call `analyze`.

Phase 3 registers two provider identifiers, `mock` and `ollama`.
`MockCommitAnalysisProvider` derives a fixed set of deterministic suggestions
from staged file metadata and statistics. It performs no filesystem,
environment-variable, model, or network I/O. Its suggestions prove the review
flow; they are not semantic claims from an LLM.

`OllamaProvider` resolves CLI overrides, environment variables, and defaults;
enforces the diff-size limit; reports sensitive-filename warnings; calls
`POST /api/generate` with native `fetch`; maps transport and provider failures;
parses the response; and validates the model JSON with the shared Zod schema.
The CLI validates the returned object a second time at the application boundary.

The provider sets a neutral optional `progressMessage` property. This lets the
CLI show progress without a provider identifier branch and keeps JSON mode
silent.

### Prompt layer

`buildCommitAnalysisPrompt` is separate from provider communication. It creates
the trusted instructions, JSON Schema, Conventional Commit constraints, changed
file list, recent commit context, and staged-diff delimiters. Repository content
is labeled untrusted and the model is told not to follow instructions in source
comments, filenames, commit subjects, or the diff.

### Safety layer

The isolated staged-content safety module detects representative sensitive
filenames. Ollama reports a warning because the endpoint is local by default.
The policy and detection code are not embedded in the CLI or transport, so a
future cloud provider can enforce a stricter policy without changing Git
inspection.

### Commit-analysis validation

The shared Zod schema requires:

- A non-empty, single-line summary.
- A boolean split recommendation.
- An optional, non-empty split reason.
- Between one and three commit suggestions.

Each suggestion requires:

- One supported Conventional Commit type.
- An optional normalized scope.
- A non-empty, single-line description.
- A non-empty, single-line explanation.
- A finite confidence score between 0 and 1, inclusive.

Strict object schemas reject unexpected properties. Text length and control
character checks keep terminal and commit-message output bounded and
single-line.

### UI layer

The suggestion view formats Conventional Commit messages as:

```text
type: description
type(scope): description
```

Interactive output displays the summary, a split warning when requested by the
validated response, each suggestion's explanation and confidence, and a choice
for a custom non-empty message. Selection only prints the exact message.

JSON output serializes the complete validated provider response. It bypasses all
prompt functions and writes no headings or progress messages to standard
output.

## Provider resolution

The registry owns the supported provider identifiers and adapter construction:

```text
--provider mock
    -> provider registry
    -> MockCommitAnalysisProvider
    -> common provider interface

--provider ollama [neutral overrides]
    -> provider registry
    -> OllamaProvider
    -> native fetch to configured /api/generate
    -> common provider interface
```

Unsupported provider names are rejected by CLI option parsing before analysis.
Provider configuration precedence is CLI override, environment variable, then
provider default.

## Provider replacement

A later adapter can replace the mock without changing the Git, schema, UI, or
CLI orchestration contracts:

```text
Validated staged changes
    -> CommitAnalysisProvider
        -> mock adapter (Phase 2)
        -> Ollama adapter (Phase 3)
        -> OpenAI adapter (future Phase 4)
        -> Gemini adapter (future Phase 4)
    -> shared Zod validation
    -> shared output and selection
```

Each adapter translates the neutral request into its own transport
format and translate the result back into `CommitAnalysis`. Provider-specific
configuration, authentication, HTTP clients, SDK types, timeouts, and errors
must remain inside that adapter.

Before Ollama receives staged content, Phase 3 enforces a 100,000-character diff
limit without truncation, warns for sensitive-looking filenames, and clearly
delimits untrusted content. The response is requested using a JSON Schema and
remains untrusted until Zod validation succeeds.

## Safety invariants

- Git inspection is read-only.
- An empty staged snapshot stops before provider resolution.
- An oversized diff stops before an Ollama request.
- Sensitive-looking staged filenames produce a warning.
- Provider output never bypasses runtime validation.
- JSON mode never invokes interactive prompts.
- JSON mode never prints progress to standard output.
- Selecting or entering a message never invokes Git.
- No code reads cloud API keys.
- Only the Ollama provider makes an HTTP request, using native `fetch`.
- Known Ollama cloud model names and direct `ollama.com` endpoints are rejected.
- No OpenAI or Gemini dependency or adapter is present.
- The mock provider is deterministic for the same validated staged input.
- The current index and commit history remain unchanged by inspection and
  suggestion commands.

## Deferred work

Phase 3 intentionally does not implement:

- OpenAI or Gemini.
- Content redaction or guaranteed secret detection.
- Mixed-change detection.
- Automatic splitting or staging changes.
- Commit confirmation or `git commit`.
- Automatic retries, cloud credentials, or provider fallback.

Those concerns require their own phases and must preserve the provider and
safety boundaries above.
