# gatherbrain

`gatherbrain` is a local-first working-memory system for capturing small facts, navigating contexts, and planning attention while you work.

It runs in the terminal. You move through a workspace as **contexts**, capture tiny **facts**, briefly **peek** at other contexts without leaving your current one, use **lenses** to ask different questions of the same facts, and assign time blocks to contexts with the planner.

The important idea is not that facts are Markdown files. The important idea is that every thought gets a stable identity. Once a thought has an identity, it can accumulate metadata, become related to other contexts, show up in task views, be edited, be cited, be summarized, or be used by another tool.

Markdown, directories, JSON config, TSV timeboxes, and TSV event logs are the durable storage format. The running app loads them into an in-memory object model and renders from that model.

## What Problem It Solves

Most note systems ask you to stop and organize your thought before you have finished having it. That is expensive: you have to remember the thought, decide where it goes, choose metadata, and then get back to the work that triggered it.

`gatherbrain` is built around a smaller loop:

1. Go to the context you are already working in.
2. Type the thing you want to remember.
3. Let the app give it a stable identity.
4. Use lenses, relations, and timeboxes later to see the same facts through different questions.

The goal is not to build a perfect taxonomy. The goal is to reduce the cost of maintaining and extending your own working memory.

## The Basic Model

- A **context** is a scope of attention. It maps to a directory under the workspace root.
- A **fact** is an atomic thing you want to remember. It has a workspace-relative path in the model and a front matter UUID for durable identity across moves.
- A **peek** is a context you are looking at without leaving the current context.
- A **lens** is a view over visible facts, such as `all`, `todo`, `due`, `today`, or `current`.
- A **timebox** is an intended block of focus assigned to a context. Timeboxes are independent of facts and overlay older timeboxes without rewriting them.
- An **event** is an append-only log row recording a state change, view change, or external tool action.

New facts are always created in the current context. If you are peeking at another context, the fact is still created where you are, but it is related to the peeked context.

Contexts can nest. That makes them more than folders: they are nested scopes. For example, `walgreens/enterprise-architecture/steve/meeting-july-2` is a path through increasingly specific attention.

## Why It Is Designed This Way

`gatherbrain` treats memory as something distributed between your head, your current task, the workspace model, and durable files.

See [Design Theory](docs/design-theory.md) for the research grounding behind these choices, [Vision](docs/vision.md) for the larger direction, and [Inspiration](docs/inspiration.md) for a working inventory of source ideas.

## Storage

A workspace is a directory tree:

```text
workspace/
  people/
    alex/
      follow-up.md
  projects/
    gatherbrain/
      idea.md
```

Each fact is serialized as Markdown with front matter:

```markdown
---
title: Follow up with Alex about the prototype
type: fact
id: 11111111-1111-4111-8111-111111111111
relatedContexts: ["people/alex"]
---

Follow up with [Alex](/people/alex) about the prototype.
```

The title is a plain-text preview capped at 80 characters. The full captured text is stored in the body. `@context` references in captured text are converted to Markdown links. The workspace-relative path is the model ID; the front matter UUID gives the fact a durable identifier that can survive moves and be useful to other tools.

Hidden directories are ignored, including `.trash`, `.gatherbrain`, and any directory whose name starts with `.`.

Each context may include a reserved `index.md` file for metadata about the context itself. The model attaches that file to the context and does not render it as a normal fact.

Timeboxes are stored separately under `.gatherbrain/timeboxes/` as one TSV file per day. Each row stores a context path, start time, and end time; later rows overlay earlier rows when resolving who owns a moment. The planner shows the configured workday by default, `08:00-18:00` unless changed in workspace settings.

Events are stored under `.gatherbrain/events/` as one TSV file per day. Each row contains a timestamp, event name, and JSON metadata.

This format keeps the data useful outside the app. Editors, scripts, search tools, Git, backups, importers, and LLM-based tools can all work with the same files.

## Run

```sh
npm install
npm start -- /path/to/workspace
```

Use `:q`, `:quit`, `:exit`, or `Ctrl+C` to leave the prompt.

## Common Commands

- Type plain text and press Enter to save a fact.
- `Follow up -- todo today /people/alex` saves a fact, then applies the same type, due date, and relation metadata used by item update shorthand.
- `:switch projects/gatherbrain` changes context.
- `:peek people/alex` looks at another context without leaving the current one.
- `:lens today` changes the current lens.
- `:edit 3` opens the third visible fact in `$EDITOR`.
- `:delete 3` moves the third visible fact to `.trash`.
- `:move 3 /projects/gatherbrain` moves a fact and relates it to the context it came from.
- `:open` opens the current context directory; `:open 3` opens a referenced file.
- `:paste` saves the current clipboard contents and creates a companion fact.
- `:plan 9-12 /projects/gatherbrain` assigns focus time to a context.
- `:plan` shows the current day's planner timeline.
- `:now` switches to the context that owns the current time.
- `:restart` restarts the app and restores the current UI state.

Press `Tab` after `:` to complete command names. When a command needs more information, the prompt asks for arguments one at a time.

See [Usage](docs/usage.md) for the full command reference.

## Configure

Defaults live in `default-config/`. Workspace-local configuration lives under `.gatherbrain/` in the workspace root and overrides or extends defaults.

Configuration is part of the model. Commands, enum-backed argument values, lenses, and templates form a small DSL for shaping the system around a user's own vocabulary and workflows.

- [Custom Commands](docs/custom-commands.md)
- [Custom Enums](docs/custom-enums.md)
- [Custom Lenses](docs/custom-lenses.md)

## Architecture

See [Source Architecture](src/README.md) for implementation details and source-file responsibilities.

## Test

```sh
npm test
```
