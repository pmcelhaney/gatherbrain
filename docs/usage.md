# Usage Guide

This guide describes the app as it works today.

## Starting The App

```bash
npm start
```

Gatherbrain opens a terminal screen with:

- a header showing the current date and session
- a divider
- a fact or calendar body
- a prompt at the bottom

The default workspace is `./workspace`. It is ignored by git because it contains
local user data.

Use `GATHERBRAIN_WORKSPACE` to choose another storage location:

```bash
GATHERBRAIN_WORKSPACE=~/gatherbrain-notes npm start
```

## Sessions

A session is the current unit of work. You must switch to a session before
capturing facts.

```text
:switch Steve
:switch Architecture Review Board
:switch Thinking about Gatherbrain design
```

There is no separate session creation command yet. Switching to a new name is
enough; the session becomes real when facts or time boxes are stored for it.

## Capturing Facts

In capture mode, plain text becomes a fact in the current session.

```text
Mike prefers async architecture reviews.
```

Captured facts currently use the default type `fact`.

Facts are stored as Markdown files with front matter beneath the workspace date
and session folder.

## Searching

Search mode begins with `/`.

```text
/Steve
/"async architecture"
/type:todo
/due:today
/session:"Architecture Review Board"
```

Multi-word field values must be quoted:

```text
/session:"Architecture Review Board"
```

Adjacent terms imply `AND`:

```text
/Steve architecture
```

Boolean operators are supported:

```text
/type:todo OR type:waiting
/Steve AND NOT done
/(type:todo OR type:waiting) AND due<=today
```

Search shortcuts:

```text
//current
//today
//session
//overdue
```

`//session` requires a current session.

## Selecting And Updating Facts

Search results are numbered in the body. Selection mode starts with numbers or
dots.

Numbers select displayed fact numbers:

```text
1 todo
3 delete
```

Dots select visible row positions:

```text
. todo
.. tomorrow
```

Multiple selectors can be used together:

```text
. .. todo
1 3 7 delete
```

Current built-in actions:

| Action | Effect |
| --- | --- |
| `todo` | Sets type to `todo` |
| `waiting` | Sets type to `waiting` |
| `done` | Sets type to `done` |
| `tomorrow` | Sets due date to tomorrow |
| `delete` | Moves the fact to `.trash` |
| `gather` | Associates the fact with the current session |

## Planning Time

Plan mode begins with `;`.

```text
; 9-10 Steve
; 11-12 Counterfact
; tomorrow 14:30-15:00 Reading
```

Time boxes are independent from facts. They are stored in daily text files:

```text
workspace/timeboxes/2026-06-30.txt
```

Each line looks like:

```text
09:00-10:00 | Steve | 2026-06-30-0900-1000-steve
```

## Commands

| Command | Status |
| --- | --- |
| `:switch <session>` | Switches to a session |
| `:restart` | Clears current app state |
| `:paste` | Recognized, but paste mode is not implemented yet |
| `:exit` | Exits the app |
| `:quit` | Exits the app |

## Storage

Facts:

```text
workspace/
  2026-06-30/
    Steve/
      <uuid>-follow-up-with-steve.md
```

Deleted facts:

```text
workspace/
  2026-06-30/
    Steve/
      .trash/
```

Time boxes:

```text
workspace/
  timeboxes/
    2026-06-30.txt
```

## Current Limitations

- `:paste` does not enter a real paste/import mode yet.
- The TUI redraws as a persistent screen in an interactive terminal, but piped
  input prints each frame for testability.
- Search re-reads Markdown files from disk rather than using a long-lived index.
- Completion is not implemented yet.
- Plan mode commits after Enter; live preview while typing is still future work.
