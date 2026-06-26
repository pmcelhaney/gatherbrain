# Source Architecture

`gatherbrain` is a Node.js TUI for capturing and browsing Markdown facts inside a directory tree. The CLI receives a workspace root directory, loads that tree into an in-memory model, renders the current lens from that model, and writes every mutation back to the filesystem.

## Core Concepts

- A **context** is a directory under the workspace root. The root context has the ID `""`; nested contexts use slash IDs such as `people/alex`.
- A **fact** is a Markdown file with front matter. Its ID is its workspace-relative path, such as `people/alex/follow-up.md`.
- A **peek** is a second context being viewed from the current context. Saving while peeking still writes into the current context and relates the new fact to the peeked context.
- A **lens** chooses a presenter and template. Presenters are built into the app; lens definitions and templates are configurable.
- The **object model** is the source for rendering and command selection during a run. Filesystem changes refresh that model after app-driven mutations and through watchers.

## Runtime Flow

1. `index.js` creates prompt state, loads command/enums/lens registries, and loads the workspace model.
2. `model.js` indexes contexts and facts from disk, ignoring hidden directories.
3. `lenses.js` presents visible facts for the active context or peek context.
4. `index.js` converts facts into view models, renders the body through `templates.js`, and draws the prompt line.
5. User input is parsed by `commands.js`. If a command mutates data, `index.js` calls `api.js`, which uses `facts.js` for Markdown/files and `model.js` to refresh the changed model region.
6. `config-watch.js` and `model.js` watchers keep local configuration and workspace data current while the app is running.

## Files

### `index.js`

The CLI entry point and TUI coordinator. It owns prompt state, rendering, key handling, completion, command execution, restart snapshots, clipboard paste, `$EDITOR` handoff, platform open commands, and watcher setup.

Important exports used heavily by tests include `createPromptState`, `handleEntry`, `completeEntry`, `buildTuiLines`, `renderTui`, `visibleFactsForState`, and restart helpers.

### `api.js`

Command-facing workspace operations. It is the boundary between the TUI and the workspace model: creating facts and contexts, resolving context references, deleting facts, relating facts, setting fact type/properties, resolving referenced files, adding enum values, and refreshing the in-memory model after changes.

It also exposes read-only model queries intended for future LLM and dashboard surfaces, including all facts, facts in a context, visible facts for the active lens, related facts, recent facts, facts by type, and due/today/current fact sets.

Prefer putting reusable app operations here rather than making `index.js` call `facts.js` or `model.js` directly.

### `facts.js`

Low-level Markdown and filesystem helper layer. It builds and parses front matter, normalizes titles and filename slugs, converts `@context` mentions to Markdown links, creates facts, edits fact properties and relations, deletes facts into `.trash`, lists legacy fact views, and resolves context directories.

Keep durable file-format behavior here when possible. Higher layers should pass intent and context, not rewrite Markdown ad hoc.

### `model.js`

The in-memory workspace model. It loads:

- `rootPath`
- `contexts: Map<contextId, Context>`
- `facts: Map<factId, Fact>`

It also provides targeted refresh helpers (`refreshFact`, `refreshContext`, `removeFact`) and `watchWorkspaceModel`. Hidden directories are ignored, including `.trash`, `.gatherbrain`, and any directory whose name starts with `.`.

### `commands.js`

The command DSL loader, parser, argument validator, and action builder. It merges `default-config/commands.json` with workspace-local `.gatherbrain/commands.json`. Arguments support command-specific types such as `fact`, `context`, `lens`, `date`, `text`, and enum-backed values.

This module parses command intent only; `index.js` executes the resulting actions.

### `lenses.js`

Lens registry and presenter logic. It merges `default-config/lenses.json` with workspace-local `.gatherbrain/lenses.json`, filters facts, and builds body view models. Current built-in presenters include all/context facts, due, today, and current.

This is where visibility semantics live, including related facts, child-context facts, source-context display metadata, and due/current filtering.

### `templates.js`

Handlebars rendering for body templates. Defaults live in `default-config/templates`; workspace overrides live in `.gatherbrain/templates`. Templates support a pipe-style color filter such as `{{type | color: "cyan"}}`, transformed before Handlebars compilation.

### `enums.js`

Enum registry loader. It merges `default-config/enums.json` with workspace-local `.gatherbrain/enums.json`. Enums are used for command argument validation and autocomplete, for example the `factType` enum used by `:type` and `%<type>` fact capture.

### `dates.js`

Natural-language date parsing and ISO date formatting for command arguments. It handles stable values such as `today`, `tomorrow`, weekdays, and calendar dates.

### `config-watch.js`

Filesystem watcher for workspace-local configuration under `.gatherbrain`. It reports changes to commands, enums, lenses, and templates so `index.js` can reload registries and clear template caches.

## Configuration Outside `src`

- `default-config/commands.json`: built-in command DSL definitions.
- `default-config/enums.json`: built-in enum definitions.
- `default-config/lenses.json`: built-in lens definitions.
- `default-config/templates/facts.hbs`: default facts body template.
- `scripts/import-people.js`: Notion collaborators CSV importer that creates one context per person and one source-traceable fact per imported cell.

## Design Guidelines

- Prefer changing `facts.js` for Markdown/file-format rules.
- Prefer changing `model.js` for workspace indexing and refresh behavior.
- Prefer changing `api.js` for command-facing workspace operations, reusable read queries, and model refresh after mutations.
- Prefer changing `lenses.js` for what is visible and what metadata presenters expose to templates.
- Prefer changing `templates.js` and `default-config/templates` for rendering syntax and default body output.
- Prefer changing `commands.js` and `default-config/commands.json` for command parsing and DSL shape.
- Keep `index.js` focused on orchestration, TUI behavior, command execution, and integration boundaries.
