# Usage Guide

This guide describes the app as it works today.

## Core Concepts

Gatherbrain centers on facts, contexts, capture, transient search, selection
commands, and tab completion.

A fact belongs to one home context. Selection commands such as `gather` can
associate that fact with additional contexts without moving the underlying
Markdown file. The `claim` selection command moves a fact into the current
context by making the current context its home context.

Tags and time boxes are not active product concepts.

## Starting The App

```bash
npm start
```

Gatherbrain opens a terminal screen with:

- a header showing the current context
- a divider
- a fact/search/help body
- a prompt at the bottom

The default workspace is `./workspace`. It is ignored by git because it
contains local user data.

On startup, Gatherbrain loads persisted facts from the workspace. Search results
show facts in or associated with the current context first, then a blank line,
then other matches. Each group is ordered newest first.

Use `GATHERBRAIN_WORKSPACE` to choose another storage location:

```bash
GATHERBRAIN_WORKSPACE=~/gatherbrain-notes npm start
```

## Contexts

A context is the current unit of work. You must switch to a context before
capturing facts.

```text
@Steve!
@Architecture Review Board!
@Thinking about Gatherbrain design!
@Steve\ Ma\!
```

Escaped spaces are normalized when switching, and a trailing `!` opts into
creating the context if it does not exist yet. The last example stores and
searches the context as `Steve Ma`.

Plain `@<context>` switches only to an existing context: a workspace directory
or a context already referenced by a fact. If the context does not exist, the
switch is rejected instead of creating it on the fly.

While typing a prompt that starts with `@`, the body shows the most recently
visited contexts in newest-first order. Enter a listed number or dots to switch:

```text
@1
@..
```

## Capturing Facts

In capture mode, plain text becomes a fact in the current context.

```text
Mike prefers async architecture reviews.
```

Captured facts use the configured default type. Without config, the default type
is `fact`.

If captured text contains an `http://` or `https://` URL, the fact is saved as
`type: bookmark`. The first URL is stored in front matter as `url:` and removed
from the body:

```text
Read the Node docs https://nodejs.org/api/test.html
```

The terminal row renders the saved body as a hyperlink to the saved URL.

Natural language dates in captured text are stored as `YYYY-MM-DD`. Supported
forms include `today`, `tomorrow`, `yesterday`, weekdays, `next <weekday>`, and
month-day phrases such as `June 1`.

Facts are stored as Markdown files with front matter beneath the workspace
context folder. Slash-separated context names are stored as nested directories.
Workspace directories are valid contexts even before they contain facts.

There is no separate tag model. `@Steve` inside fact text is stored as normal
content and also associates the fact with the referenced context.

When a fact is shown in a context because it is associated with that context but
was created somewhere else, the row ends with its origin context as
`<Origin Context`.

## Searching

Search mode begins with `/`.

```text
/
/Steve
/"async architecture"
/type:task
/due:today
/context:"Architecture Review Board"
/context:Architecture Review Board
/@Architecture Review Board
```

Slash searches preview matching facts while the query is in the prompt.
Pressing Enter on a plain search returns to the current context.

`/` by itself previews the current context query. If there is no current
context, it previews all facts.

Multi-word context values may be quoted or unquoted:

```text
/context:"Architecture Review Board"
/context:Architecture Review Board
```

Adjacent terms imply `AND`:

```text
/Steve architecture
```

Boolean operators are supported:

```text
/type:task OR type:waiting
/Steve AND NOT done
/(type:task OR type:inprogress OR type:waiting) AND due<=today
```

Search shortcuts:

```text
//current
//today
//overdue
```

`//current` includes active tasks with no due date. Default shortcuts are
defined in `gatherbrain.config.json` and may be extended or overridden there.

## Selection Commands

Search results are numbered in the body. A selection command starts with
numbers or dots followed by an instruction.

Numbers select displayed fact numbers:

```text
1 task
3 delete
```

Dots select visible row positions:

```text
. task
. today
.. tomorrow
. Friday
. next Friday
. June 1
```

Multiple selectors and actions can be used together:

```text
. .. task
1 3 7 delete
3 task today
. waiting tomorrow
```

You can scope a selection command to a recent context by starting with its
`@` preview selector or context name:

```text
@2 1 task today
@.. . waiting
@Gatherbrain 1 task
```

You can also scope a selection command to a search by ending the search text
with `;` and placing the selectors and actions after it:

```text
/context:Project\ Sapphire;1 5 gather
/context:Project\ Sapphire;1 5 claim
```

Current built-in actions:

| Action | Effect |
| --- | --- |
| `task` | Sets type to `task` |
| `waiting` | Sets type to `waiting` |
| `inprogress` | Sets type to `inprogress` |
| `abandoned` | Sets type to `abandoned` |
| `done` | Sets type to `done` |
| `today` | Sets due date to today |
| `tomorrow` | Sets due date to tomorrow |
| natural date phrase | Sets due date to the resolved date |
| `-due` | Removes the due date |
| `delete` | Moves the fact to `.trash` |
| `gather` | Associates the fact with the current context |
| `claim` | Moves the fact to the current context as its home context |
| `go` | Switches to the home context of the last selected fact |
| `@<context>` | Adds an associated context |
| `-@<context>` | Removes an associated context |
| `open` | Opens the URL, file, or both associated with the fact |
| `edit` | Opens the fact Markdown file in `$EDITOR`; with multiple selectors, only the last mentioned fact is edited |

Undo the most recent selection action:

```text
:undo
```

## Commands

| Command | Status |
| --- | --- |
| `@<context>` | Switches to an existing workspace or fact-referenced context |
| `@<context>!` | Creates the context if needed, then switches |
| `:undo` | Undoes the most recent selection action |
| `:help` | Shows in-app help |
| `:restart` | Restarts the TUI process and reloads current state |
| `:paste` | Prompts for a name, writes the clipboard into the current context, and creates a `type: file` fact |
| `:exit` | Exits the app |
| `:quit` | Exits the app |

Tab completes commands, `@<context>` switches, inline `@<context>` references in
capture text, search shortcuts, selection actions, visible result numbers, and
context names. Context completions include workspace context directories and
contexts already referenced by facts.

## Configuration

Gatherbrain loads `gatherbrain.config.json` from the current working directory
when it starts. The file is optional. Settings merge over the built-in defaults.

```json
{
  "defaultFactType": "note",
  "searchShortcuts": {
    "current": "(type:task OR type:inprogress OR type:waiting) AND (due<=today OR NOT due:*)",
    "overdue": "due<today",
    "today": "due:today"
  },
  "selectionActions": {
    "actions": {
      "idea": { "action": "set_type", "value": "idea" }
    }
  }
}
```

Configured search shortcuts and selection actions are available to both
execution and completion.

## Storage

Facts:

```text
workspace/
  Steve/
    <uuid>-follow-up-with-steve.md
  Technology Assembly/
    2026-07-08/
      <uuid>-prep-the-assembly-agenda.md
```

Pasted files live alongside facts in the same context folder:

```text
workspace/
  Steve/
    login-screenshot.png
    <uuid>-login-screenshot.md
```

Deleted facts:

```text
workspace/
  Steve/
    .trash/
```

## Current Limitations

- The TUI redraws as a persistent screen in an interactive terminal, but piped
  input prints each frame for testability.
- The search index is an in-memory runtime cache and is rebuilt after restart.
