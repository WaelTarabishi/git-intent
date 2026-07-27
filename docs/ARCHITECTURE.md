# Architecture

## Phase 2 scope

Phase 2 implements a complete read-only review path with deterministic local
data:

```text
Developer command
    -> CLI argument parsing
    -> staged Git inspection
    -> staged-change validation
    -> provider resolution
    -> provider analysis
    -> commit-analysis validation
    -> JSON output or interactive selection
    -> selected-message output
```

There is no commit layer in this phase. No implemented path stages files,
unstages files, creates a commit, contacts a network service, or reads provider
credentials.

## Layer boundaries

### CLI layer

The CLI defines the `inspect` and `suggest` commands and coordinates the other
layers. It:

- Parses and validates command options.
- Requests staged data through the Git inspection layer.
- Resolves a provider by its neutral identifier.
- Validates every provider result before display.
- Chooses between JSON and interactive output.
- Reports errors to standard error.

The CLI does not parse Git output, implement provider-specific protocols, or run
`git commit`. Its dependencies are injectable so provider-interface usage and
non-interactive behavior can be tested without a real repository or terminal.

### Git layer

`GitService.inspectStagedChanges` remains the sole source of repository facts.
It invokes only read operations:

- Verify that Git is installed and the current directory is a work tree.
- Find the repository root.
- Read staged filenames and statuses.
- Read the staged diff and statistics.
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

Phase 2 registers one provider identifier, `mock`.
`MockCommitAnalysisProvider` derives a fixed set of deterministic suggestions
from staged file metadata and statistics. It performs no filesystem,
environment-variable, model, or network I/O. Its suggestions prove the review
flow; they are not semantic claims from an LLM.

Although TypeScript expresses the expected provider result, runtime provider
output remains untrusted. The CLI always sends it through the shared Zod schema
after `analyze` returns.

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
```

Only `mock` is accepted in Phase 2. Unsupported provider names are rejected by
CLI option parsing before analysis.

## Future provider replacement

A later adapter can replace the mock without changing the Git, schema, UI, or
CLI orchestration contracts:

```text
Validated staged changes
    -> CommitAnalysisProvider
        -> mock adapter (Phase 2)
        -> Ollama adapter (future Phase 3)
        -> OpenAI adapter (future Phase 4)
        -> Gemini adapter (future Phase 4)
    -> shared Zod validation
    -> shared output and selection
```

Each future adapter will translate the neutral request into its own transport
format and translate the result back into `CommitAnalysis`. Provider-specific
configuration, authentication, HTTP clients, SDK types, timeouts, and errors
must remain inside that adapter.

Before any real local or cloud model receives staged diff content, later phases
must add the planned sanitization, secret filtering, size limits, content
delimiting, and destination disclosure. No such model or transport exists in
Phase 2.

## Safety invariants

- Git inspection is read-only.
- An empty staged snapshot stops before provider resolution.
- Provider output never bypasses runtime validation.
- JSON mode never invokes interactive prompts.
- Selecting or entering a message never invokes Git.
- No Phase 2 code reads API keys or provider environment variables.
- No Phase 2 code makes a network request.
- No Ollama, OpenAI, or Gemini dependency or adapter is present.
- The mock provider is deterministic for the same validated staged input.
- The current index and commit history remain unchanged by inspection and
  suggestion commands.

## Deferred work

Phase 2 intentionally does not implement:

- Ollama, OpenAI, or Gemini.
- Secret filtering for model transport.
- Mixed-change detection.
- Automatic splitting or staging changes.
- Commit confirmation or `git commit`.
- Retries, model configuration, credentials, or provider fallback.

Those concerns require their own phases and must preserve the provider and
safety boundaries above.
