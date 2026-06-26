# gatherbrain

`gatherbrain` is a local-first, prompt-first second brain for capturing small pieces of knowledge while you work.

It runs in the terminal. You point it at a workspace directory, move through that directory tree as **contexts**, and save short **facts** as Markdown files. The app keeps an in-memory model of the workspace so it can render quickly, update after edits, and reflect external file changes while it is running.

## What Problem It Solves

Most note systems ask you to stop and organize your thought before you have finished having it. That is expensive: you have to remember the thought, decide where it goes, choose metadata, and then get back to the work that triggered it.

`gatherbrain` is built around a smaller loop:

1. Go to the context you are working in.
2. Type the thing you want to remember.
3. Let the app store it as a plain Markdown fact.
4. Use lenses later to see the same facts through different questions.

The goal is not to build a perfect taxonomy. The goal is to make useful memory traces cheap to capture and easy to re-find.

## The Basic Model

- A **context** is where you are. It maps to a directory under the workspace root.
- A **fact** is something you want to remember. It is stored as a Markdown file with front matter.
- A **peek** is a context you are looking at without leaving the current context.
- A **lens** is a view over visible facts, such as `all`, `todo`, `due`, `today`, or `current`.

New facts are always created in the current context. If you are peeking at another context, the fact is still created where you are, but it is related to the peeked context.

## Why It Is Designed This Way

`gatherbrain` treats memory as something distributed between your head, your filesystem, and your current task. That design is grounded in a few ideas from cognitive science and human-computer interaction:

- Human working memory is limited, so capture should be fast and should not require much up-front categorization.
- People remember better when retrieval cues match the context in which something was encoded, so facts live inside meaningful directory contexts.
- Re-finding personal information often depends on partial cues like where something was, who it was about, or what task it belonged to.
- Interfaces should reduce recall burden and support recognition, so commands use completion and visible item numbers.
- Expert tools should preserve flow, so the TUI keeps navigation, capture, editing, and filtering close to the keyboard.

See [Design Theory](docs/design-theory.md) for the plain-English research grounding behind these choices.

## How It Stores Data

A workspace is just a directory tree.

```text
workspace/
  people/
    alex/
      follow-up.md
  projects/
    gatherbrain/
      idea.md
```

Each fact is a Markdown file:

```markdown
---
title: Follow up with Alex about the prototype
type: fact
relatedContexts: ["people/alex"]
---

Follow up with [Alex](/people/alex) about the prototype.
```

The title is a plain-text preview capped at 80 characters. The full captured text is stored in the body. `@context` references in captured text are converted to Markdown links.

Hidden directories are ignored, including `.trash`, `.gatherbrain`, and any directory whose name starts with `.`.

## Run

```sh
npm install
npm start -- /path/to/workspace
```

Use `:q`, `:quit`, `:exit`, or `Ctrl+C` to leave the prompt.

## Common Commands

- Type plain text and press Enter to save a fact.
- `:switch projects/gatherbrain` changes context.
- `:peek people/alex` looks at another context without leaving the current one.
- `:lens today` changes the current lens.
- `:edit 3` opens the third visible fact in `$EDITOR`.
- `:delete 3` moves the third visible fact to `.trash`.
- `:paste` saves the current clipboard contents and creates a companion fact.
- `:restart` restarts the app and restores the current UI state.

Press `Tab` after `:` to complete command names. When a command needs more information, the prompt asks for arguments one at a time.

See [Usage](docs/usage.md) for the full command reference.

## Configure

Defaults live in `default-config/`. Workspace-local configuration lives under `.gatherbrain/` in the workspace root and overrides or extends defaults.

- [Custom Commands](docs/custom-commands.md)
- [Custom Enums](docs/custom-enums.md)
- [Custom Lenses](docs/custom-lenses.md)

## Import People

`gatherbrain` includes a Notion collaborators CSV importer that creates one context per person and one source-traceable fact per imported cell.

```sh
npm run import:people -- /path/to/collaborators.csv /path/to/workspace
```

## Architecture

See [Source Architecture](src/README.md) for implementation details and source-file responsibilities.

## Test

```sh
npm test
```
