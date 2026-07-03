# Core Class Sketch

This sketch treats the spec as a domain model first and a terminal UI second.
The goal is to keep storage, parsing, state transitions, and rendering separate
enough that each can be tested without running the full TUI.

## Domain Classes

### `Context`

Represents a named unit of work.

Responsibilities:

- Normalize and expose the context name.
- Provide filesystem-safe path segments for storage.
- Compare contexts by canonical name.

### `Fact`

Represents one Markdown-backed unit of knowledge.

Core fields:

- `id`
- `content`
- `type`
- `createdAt`
- `dueDate`
- `file`
- `url`
- `homeContext`
- `associatedContexts`

Responsibilities:

- Enforce the invariant that every fact has exactly one home context.
- Enforce that every fact ID is a UUID.
- Add or remove associated contexts without duplicating the home context.
- Apply domain changes such as `setType`, `setDueDate`, and `associateContext`.
- Produce a serializable representation for Markdown storage.

## Application State

### `AppState`

Owns the current interactive state.

Core fields:

- `currentContext`
- `currentQuery`, derived from the current context or transient prompt preview
- `currentSelection`
- `currentMode`

Responsibilities:

- Enforce that facts cannot be captured before a context is selected.
- Reset in-memory state during startup and runtime restart reloads.
- Switch contexts and derive the default context query.
- Track mode transitions inferred from prompt input.

### `Selection`

Represents stable selected fact identities, not just row numbers.

Responsibilities:

- Resolve number and dot selectors against the current `SearchResultSet`.
- Preserve selected fact IDs for command execution.
- Clear when the context or query changes.

Selections are operated on through selection commands: selectors plus actions
against the current body, a recent-context preview, or a semicolon-delimited
transient search.

## Parsing And Dispatch

### `PromptClassifier`

Classifies raw prompt input into capture, search, command, or selection mode.

### `PromptController`

Coordinates prompt handling.

Responsibilities:

- Accept raw input.
- Ask `PromptClassifier` which mode applies.
- Route to capture, command, search, or selection handling.
- Return an `InteractionResult` describing state changes and messages.

### `SearchQueryParser`

Parses `/` input after shortcut expansion.

Responsibilities:

- Support terms, quoted phrases, field filters, Boolean operators, and grouping.
- Enforce precedence: `NOT`, then `AND`, then `OR`.
- Treat adjacent terms as implicit `AND`.
- Produce a query AST.

### `SearchShortcutRegistry`

Expands `//shortcut` queries.

### `CommandRegistry`

Maps command names to command objects.

Supported commands include:

- `@<context>`
- `@<context>!`
- `:undo`
- `:restart`
- `:paste`
- `:help`
- `:exit` / `:quit`

### `SelectionActionRegistry`

Maps configurable action keywords to action objects.

Built-in actions include:

- `SetTypeAction`
- `SetDueDateAction`
- `ClearDueDateAction`
- `TrashFactAction`
- `AssociateCurrentContextAction`
- `ClaimCurrentContextAction`
- `RemoveContextAssociationAction`
- `OpenFileAction`
- `EditFactFileAction`

## Persistence

### `Workspace`

Represents the root storage location.

Responsibilities:

- Locate context folders, fact files, pasted files, and `.trash`.
- Provide path-building helpers for repositories.

### `FactRepository`

Persists facts as Markdown files with front matter.

Responsibilities:

- Create facts in `<workspace>/<home context>/`.
- Read facts from Markdown files and derive each fact's home context from its
  containing directory.
- Update front matter and content.
- Move deleted facts into `.trash` under their home context.

### `PasteRepository`

Writes clipboard payloads as files beside facts in the current context.

### `MarkdownFactCodec`

Handles conversion between `Fact` instances and Markdown files.

Responsibilities:

- Parse front matter.
- Serialize front matter.
- Require repository-provided storage context for the fact's home context.
- Preserve fact body content.
- Tolerate legacy `tags:` front matter without exposing it as active metadata.

### `AppStateRepository`

Persists resumable app state, currently the last current context.

## Search And Results

### `SearchEngine`

Executes parsed search queries against facts.

Responsibilities:

- Evaluate query AST nodes against facts.
- Support field filters such as `type`, `due`, `context`, and `content`.
- Return a stable `SearchResultSet`.

### `SearchResultSet`

Represents the facts visible in the body.

Responsibilities:

- Maintain stable fact numbers until the context or search changes.
- Expose visible ordering for rendering and dot selection.
- Resolve displayed numbers to fact IDs.

## Terminal UI

### `TerminalApp`

Top-level renderer coordinator for header, body, completion/status lines, and
prompt.

### `HeaderRenderer`

Renders current context, preview query, and viewed-context breadcrumbs.

### `BodyRenderer`

Renders facts, search results, help lines, recent-context lists, and selection
previews.

### `PromptRenderer`

Renders the prompt and cursor/completion suffix state.

## Suggested Dependency Direction

```text
TerminalApp
  -> PromptController
  -> AppState
  -> Registries and parsers
  -> Repositories
  -> Domain classes
```

Renderers should read view models, not repositories directly.
Repositories should know storage details, not terminal state.
Domain classes should not import UI, parser, or persistence code.
