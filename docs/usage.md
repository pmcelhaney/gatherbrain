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

On startup, Gatherbrain loads persisted facts and today's time boxes from the
workspace. Search results are ordered newest first.

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

List discovered sessions:

```text
:sessions
```

The current session is marked with `*`, and sessions are numbered. Switch to a
numbered session:

```text
:session 2
```

## Capturing Facts

In capture mode, plain text becomes a fact in the current session.

```text
Mike prefers async architecture reviews.
```

Captured facts use the configured default type. Without config, the default type
is `fact`.

Facts are stored as Markdown files with front matter beneath the workspace date
and session folder.

## Searching

Search mode begins with `/`.

```text
/
/Steve
/"async architecture"
/type:todo
/due:today
/session:"Architecture Review Board"
/session:Architecture Review Board
/@Architecture Review Board
```

`/` by itself refreshes the current query. If there is no current query, it uses
the current session query. If there is no current session, it lists all facts.

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
/(type:todo OR type:inprogress OR type:waiting) AND due<=today
```

Search shortcuts:

```text
//current
//today
//session
//overdue
```

`//session` requires a current session.

Due dates in fact rows render as friendly labels before the content:

```text
todo today Call Steve
todo tomorrow Call Steve
todo Fri Call Steve
todo Jul 10 Call Steve
```

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
. today
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
| `inprogress` | Sets type to `inprogress` |
| `abandoned` | Sets type to `abandoned` |
| `done` | Sets type to `done` |
| `today` | Sets due date to today |
| `tomorrow` | Sets due date to tomorrow |
| `delete` | Moves the fact to `.trash` |
| `gather` | Associates the fact with the current session |

Undo the most recent selection action:

```text
:undo
```

Undo is in-memory and only covers the last selection action in the current app
run.

Inspect one visible fact:

```text
:inspect 1
```

The inspect view shows the fact UUID, type, created timestamp, home session,
associated sessions, due date, file path, and content.

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

Calendar rows are numbered in plan mode. Update or delete a visible time box:

```text
:timebox 1 10-11 Architecture Review Board
:timebox delete 1
```

## Commands

| Command | Status |
| --- | --- |
| `:switch <session>` | Switches to a session |
| `:session <number>` | Switches to a numbered session from `:sessions` |
| `:sessions` | Lists sessions discovered from facts and time boxes |
| `:inspect <number>` | Shows full details for a visible fact |
| `:timebox <number> <range> <session>` | Updates a visible time box |
| `:timebox delete <number>` | Deletes a visible time box |
| `:undo` | Undoes the most recent selection action |
| `:help` | Shows in-app help |
| `:restart` | Restarts the TUI process and reloads current state |
| `:paste` | Prompts for a name, writes the clipboard into the current session, and creates a fact referencing it |
| `:exit` | Exits the app |
| `:quit` | Exits the app |

In the interactive TUI, Tab completes commands, `:switch` session names, search
shortcuts, selection actions, and visible result numbers.

In the interactive TUI, `:restart` launches a fresh app process so recent code
and configuration changes are loaded. Durable workspace state is preserved.

`:paste` requires a current session. After `:paste`, enter a name for the
pasted item. Gatherbrain writes text clipboard data as `<name>.txt` and
screenshot clipboard data as `<name>.png` in the current date/session folder,
then creates a fact named the same way with a `file: <filename>` reference.

While typing, the header and body preview the inferred mode. Plan input previews
the parsed time box before Enter commits it.

## Configuration

Gatherbrain loads `gatherbrain.config.json` from the current working directory
when it starts. The file is optional. Settings merge over the built-in defaults.

Example:

```json
{
  "defaultFactType": "note",
  "selectionActions": {
    "actions": {
      "idea": { "action": "set_type", "value": "idea" }
    }
  }
}
```

Configured selection actions are available to both execution and completion.

Use [../gatherbrain.config.example.json](../gatherbrain.config.example.json) as
a starter config.

## Storage

Facts:

```text
workspace/
  2026-06-30/
    Steve/
      <uuid>-follow-up-with-steve.md
```

Pasted files live alongside facts in the same date/session folder:

```text
workspace/
  2026-07-01/
    Steve/
      login-screenshot.png
      <uuid>-login-screenshot-file-login-screenshot-png.md
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

- The TUI redraws as a persistent screen in an interactive terminal, but piped
  input prints each frame for testability.
- The search index is an in-memory runtime cache and is rebuilt after restart.
