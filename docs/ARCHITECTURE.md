# Architecture

## Current scope

Inspection and JSON analysis remain read-only. Interactive suggestion review
has an explicit commit boundary followed by a separate optional push boundary:

```text
Developer command
    -> CLI argument parsing
    -> staged Git inspection
    -> staged-change validation
    -> provider resolution
    -> provider-owned safety and analysis
    -> commit-analysis validation
    -> JSON output (stop, read-only)
       or interactive selection
    -> confirmed local commit
    -> optional confirmed push
```

No path stages or unstages files automatically. Only an accepted interactive
message creates a commit. Push is a separate choice that defaults to No.

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
- Creates the selected commit after the review confirmation.
- Resolves the branch and upstream before offering a separate push choice.
- Reports errors to standard error.

The CLI does not parse Git output or implement provider-specific protocols. It
does not construct provider requests or parse provider responses. Its
dependencies are injectable so provider-interface and mutation behavior can be
tested without a real repository, remote, or terminal.

### Git layer

`GitService.inspectStagedChanges` remains the sole source of staged repository
facts and invokes only read operations:

- Verify that Git is installed and the current directory is a work tree.
- Find the repository root.
- Read staged filenames and statuses.
- Read the staged diff and statistics.
- Read up to five recent commit subjects when history is available.
- Reject an empty staging area.

It normalizes additions, modifications, deletions, renames, copies, type
changes, unmerged entries, binary files, and unknown statuses.

The mutation methods are separate from inspection:

- `createCommit` passes the complete reviewed message to `git commit` without a
  shell and reads the resulting short hash.
- `getPushContext` resolves the current branch, configured upstream, and
  remotes.
- `pushCurrentBranch` uses the existing upstream or an explicitly selected
  remote. A new upstream is configured only for a branch that did not have one.

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

The registry exposes `ollama` and `gemini` provider identifiers.

`OllamaProvider` resolves CLI overrides, environment variables, and defaults;
enforces the diff-size limit; reports sensitive-filename warnings; calls
`POST /api/generate` with native `fetch`; maps transport and provider failures;
parses the response; and validates the model JSON with the shared Zod schema.
The CLI validates the returned object a second time at the application boundary.

`GeminiProvider` resolves API-key, model, and timeout configuration; emits a
cloud-data disclosure; enforces the same diff-size limit; calls Gemini's
`generateContent` endpoint with native `fetch`; requests structured JSON; maps
provider failures without reflecting remote response bodies; and validates the
result with the shared Zod schema.

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
- A zero-based recommended-suggestion index that references an available
  suggestion.
- Exactly three distinct commit suggestions for comparison.

Each suggestion requires:

- One supported Conventional Commit type.
- An optional normalized scope.
- A non-empty, single-line description.
- Between one and six bounded implementation details.
- Bounded arrays for test details and breaking changes, which may be empty.
- A non-empty, single-line explanation.
- A finite confidence score between 0 and 1, inclusive.

Strict object schemas reject unexpected properties. Text length and control
character checks keep terminal and commit-message output bounded and
single-line.

### UI layer

The suggestion view formats complete Conventional Commit messages as:

```text
type(scope): description

- First meaningful implementation detail.
- Second meaningful implementation detail.

Tests:
- Relevant staged test change.

BREAKING CHANGE: Incompatible behavior demonstrated by the staged diff.
```

Interactive output displays the summary, a split warning when requested by the
validated response, and a compact subject-only choice list with the recommended
suggestion first. Details are shown only for the selected suggestion. The
developer can accept the exact preview, return to the choices, or enter a
custom non-empty message. Acceptance creates the local commit. Push is offered
after creation in a separate prompt whose default is No.

JSON output serializes the complete validated provider response. It bypasses all
prompt functions and writes no headings or progress messages to standard
output.

## Provider resolution

The registry owns the supported provider identifiers and adapter construction:

```text
--provider ollama [neutral overrides]
    -> provider registry
    -> OllamaProvider
    -> native fetch to configured /api/generate
    -> common provider interface

--provider gemini [neutral overrides]
    -> provider registry
    -> GeminiProvider
    -> native fetch to Gemini generateContent
    -> common provider interface
```

Unsupported provider names are rejected by CLI option parsing before analysis.
Provider configuration precedence is CLI override, environment variable, then
provider default.

## Provider extension

A later adapter can be added without changing the Git, schema, UI, or CLI
orchestration contracts:

```text
Validated staged changes
    -> CommitAnalysisProvider
        -> Ollama adapter (Phase 3)
        -> OpenAI adapter (future Phase 4)
        -> Gemini adapter
    -> shared Zod validation
    -> shared output and selection
```

Each adapter translates the neutral request into its own transport
format and translate the result back into `CommitAnalysis`. Provider-specific
configuration, authentication, HTTP clients, SDK types, timeouts, and errors
must remain inside that adapter.

Before a provider receives staged content, Git Intent enforces a
100,000-character diff limit without truncation, warns for sensitive-looking
filenames, and clearly delimits untrusted content. Gemini additionally emits a
cloud disclosure. Responses are requested using a JSON Schema and remain
untrusted until Zod validation succeeds.

## Safety invariants

- Git inspection is read-only.
- An empty staged snapshot stops before provider resolution.
- An oversized diff stops before a provider request.
- Sensitive-looking staged filenames produce a warning.
- Provider output never bypasses runtime validation.
- JSON mode never invokes interactive prompts.
- JSON mode never prints progress to standard output.
- JSON mode never creates a commit or pushes.
- A local commit is created only after a suggestion preview is accepted or a
  custom message is submitted.
- Push is never automatic and requires a separate explicit choice.
- Push failure does not remove the local commit, and the error identifies its
  hash.
- Only the Gemini adapter reads Gemini API-key environment variables.
- Provider adapters make HTTP requests using native `fetch`.
- Known Ollama cloud model names and direct `ollama.com` endpoints are rejected.
- API keys are sent in headers and omitted from request URLs and diagnostics.
- Inspection leaves the index, working tree, and history unchanged.

## Deferred work

Phase 3 intentionally does not implement:

- OpenAI.
- Content redaction or guaranteed secret detection.
- Mixed-change detection.
- Automatic splitting or staging changes.
- Automatic retries or provider fallback.

Those concerns require their own phases and must preserve the provider and
safety boundaries above.
