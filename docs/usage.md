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
:switch Steve\ Ma
```

Escaped spaces are normalized when switching, so the last example stores and
searches the session as `Steve Ma`.

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

If captured text contains an `http://` or `https://` URL, the fact is saved as
`type: bookmark`. The first URL is stored in front matter as `url:` and removed
from the body:

```text
Read the Node docs https://nodejs.org/api/test.html
```

The stored body is `Read the Node docs`, and the terminal row renders that text
as a hyperlink to the saved URL.

Natural language dates in captured text are stored as `YYYY-MM-DD`. Supported
forms include `today`, `tomorrow`, `yesterday`, `next <weekday>`, and month-day
phrases such as `June 1`:

```text
Follow up tomorrow and next Friday
```

The stored body is `Follow up 2026-07-01 and 2026-07-03` when today is
2026-06-30. Terminal rows render those ISO dates back as friendly labels.

Facts are stored as Markdown files with front matter beneath the workspace
session folder. Slash-separated session names are stored as nested directories,
so `Technology Assembly/2026-07-08` lives under
`workspace/Technology Assembly/2026-07-08/`.

Use `@` to refer to a session name in captured facts:

```text
@Steve\ Ma said to confirm when the @Devin trial ends
```

This saves tags `Steve Ma` and `Devin`, which share the session namespace.
Escaped spaces are input syntax only; they are not stored in the tag value.
Possessives keep the suffix as text, so `@Devin's` stores the tag `Devin`.

Root-level workspace directories are known tag/session names and are used for
completion.

## Searching

Search mode begins with `/`.

```text
/
/Steve
/"async architecture"
/type:task
/due:today
/session:"Architecture Review Board"
/session:Architecture Review Board
/@Architecture Review Board
/tag:Devin
/tag:Steve Ma
```

`/` by itself refreshes the current query. If there is no current query, it uses
the current session query. If there is no current session, it lists all facts.

Multi-word values may be quoted:

```text
/session:"Architecture Review Board"
/tag:"Steve Ma"
```

Session and tag fields also accept unquoted multi-word values.

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
//session
//overdue
```

`//session` requires a current session.

Due dates in fact rows render as friendly labels before the content:

```text
task today Call Steve
task tomorrow Call Steve
task Fri Call Steve
task Jul 10 Call Steve
```

ISO dates in fact content and `:inspect` output use the same friendly display.

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
. next Friday
. June 1
. @Steve\ Ma
```

Multiple selectors can be used together:

```text
. .. task
1 3 7 delete
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
| `delete` | Moves the fact to `.trash` |
| `gather` | Associates the fact with the current session |
| `open` | Opens the file associated with the fact |
| `edit` | Opens the fact Markdown file in `$EDITOR`; with multiple selectors, only the last mentioned fact is edited |

Any `@tag` action adds that tag to the selected facts. Escaped spaces are
normalized the same way as capture text, so `. @Steve\ Ma` stores `Steve Ma`.
Tags that are not already mentioned in the fact text render after the content as
`>Steve Ma`; tags already mentioned inline are not repeated.

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
associated sessions, due date, associated file, Markdown path, and content.

## Planning Time

Plan mode begins with `;`.

```text
; 9-10 Steve
; 11-12 Counterfact
; tomorrow 14:30-15:00 Reading
; next Friday 14:30-15:00 Reading
; June 1 9-10 Steve
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
| `:paste` | Prompts for a name, writes the clipboard into the current session, and creates a `type: file` fact |
| `:exit` | Exits the app |
| `:quit` | Exits the app |

In the interactive TUI, Tab completes commands, `:switch` session names, search
shortcuts, selection actions, visible result numbers, and known session names
after `@` in capture text. When multiple candidates match the same typed prefix,
press Tab repeatedly to cycle through them.

In the interactive TUI, `:restart` launches a fresh app process so recent code
and configuration changes are loaded. Durable workspace state is preserved.

`:paste` requires a current session. After `:paste`, enter a name for the
pasted item. Gatherbrain writes text clipboard data as `<name>.txt` and
screenshot clipboard data as `<name>.png` in the current session folder, then
creates a `type: file` fact named the same way with `file: <filename>` in front
matter. Select that fact and run `. open` to open the pasted file.

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
  Steve/
    <uuid>-follow-up-with-steve.md
  Technology Assembly/
    2026-07-08/
      <uuid>-prep-the-assembly-agenda.md
```

Pasted files live alongside facts in the same session folder:

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
