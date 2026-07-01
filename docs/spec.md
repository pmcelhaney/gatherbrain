# Gatherbrain Core Interaction Specification

This is the living project specification. It started from the original
interaction spec and should be updated as product and architecture decisions
are made.

## Implementation Target

Gatherbrain will be built in Node.js.

## Design Principles

Gatherbrain is a local-first terminal application for capturing knowledge while doing work.

The user is always working in a session.

Knowledge is captured as small facts.

Planning is managed independently through time boxes.

The interface is optimized for keyboard-first operation with minimal mode switching.

---

# Core Primitives

## Session

A session is the unit of work.

Every interaction occurs within a current session.

Examples:

- Steve
- Architecture Review Board
- Counterfact
- Reading: Team Topologies
- 2026-06-30 ARB Meeting

Sessions may be associated with facts and time boxes.

---

## Fact

A fact is a single unit of knowledge.

A fact has:

- id, stored as a UUID
- content
- type
- created timestamp
- optional due date
- optional associated file
- home session
- associated sessions

Every fact belongs to exactly one home session.

A fact may be associated with zero or more additional sessions.

A fact may have zero or more tags. Tags are captured from `@` mentions in fact
text. Escaped spaces are normalized when saving, so `@Steve\ Ma` stores the tag
`Steve Ma`. Possessives keep the suffix as text, so `@Devin's` stores the tag
`Devin`.

Tags may also be added to selected existing facts with selection input such as
`. @Steve\ Ma` or `1 @Steve\ Ma`.

Known tags may also be listed in workspace-local `tags.txt`, one tag per line.
This file belongs to the workspace data, not the application source.

---

## Search

Search retrieves facts.

The current search determines what appears in the body of the interface.

An empty search prompt (`/`) refreshes the current query. If no current query
exists, it searches the current session. If there is no current session, it
lists all facts.

Search results are ordered newest first by fact creation time.

Session search supports quoted values, unquoted multi-word session values, and
`@Session Name` shorthand.

Tag search supports `tag:<name>` field filters. Tags also participate in normal
term search.

---

## Time Box

A time box represents planned work.

A time box associates a date and period of time with a session.

Time boxes are independent of facts.

Time boxes are stored in text files, one file per date. The current date is the
normal active working set, but historical time boxes remain available by loading
the relevant date file.

---

# Storage Model

Facts are stored as Markdown files with front matter.

Directory layout:

```text
<workspace>/
    2026-06-30/
        Architecture Review Board/
            6f2308de-02e9-45db-8ff0-65ac793f4a24-review.md
            9b099737-48ad-4b28-88d3-ae75c66c9e24-risk.md

        Steve/
            5ddbf77c-cd5e-4d9c-9906-4c18d3217b7a-follow-up.md
```

Each fact contains front matter similar to:

```yaml
---
id: 6f2308de-02e9-45db-8ff0-65ac793f4a24
type: observation
created: 2026-06-30T10:15:23-04:00
home_session: Architecture Review Board
associated_sessions:
  - Steve
  - Enterprise Architecture
tags:
  - Devin
  - Steve Ma
due:
file:
---
```

Deleted facts are moved into a `.trash` directory beneath their home session.

Example:

```text
2026-06-30/
    Architecture Review Board/
        .trash/
```

Time boxes are stored separately from facts as daily text files.

Example:

```text
<workspace>/
    timeboxes/
        2026-06-30.txt
        2026-07-01.txt
```

The storage invariant is one time box file per date.

Initial time box text format:

```text
09:00-10:00 | Steve | 2026-06-30-0900-1000-steve
11:00-12:00 | Counterfact | 2026-06-30-1100-1200-counterfact
```

---

# State Model

The application maintains the following state.

```text
current_session
current_query
current_selection
current_mode
plan_preview
```

Definitions:

**current_session**

The session the user is currently working in.

A session must be entered before facts may be captured.

**current_query**

The active search query.

The body always renders the results of this query.

Default:

```text
session:<current_session>
```

**current_selection**

The facts currently selected by the user.

**current_mode**

One of:

- Capture
- Search
- Command
- Selection
- Plan

**plan_preview**

An uncommitted time box currently being edited.

---

# User Interface

The terminal UI has three regions.

## Header

Displays application state.

Examples:

- current session
- active query
- current mode
- result count

The primary header form is a workspace-style path:

```text
sessions/2026-06-30/Thinking about Gatherbrain design
```

---

## Body

Displays the result of the active query.

Normally this is a list of facts.

In plan mode it displays the calendar as a proportional timeline.

Fact rows are numbered at the left with a muted number prefix. The implicit
`fact` type is not shown. Other fact types are shown before the content.
Tags that are not already mentioned in the fact content are shown after the
content as `>Tag Name` in the tag color. Tags already mentioned inline are not
repeated at the end of the row.

Timeline rows are spaced according to elapsed time. Busy time boxes use a solid
line and filled marker. Free time uses a dotted line and open marker with the
available duration. When the current time falls within the rendered day, the
timeline includes a current-time marker at the proportional position.

Due dates are displayed as friendly labels when possible:

- today
- tomorrow
- short weekday for nearby dates
- month and day for later dates

Transient status messages are rendered inside the managed terminal screen above
the prompt.

---

## Prompt

Accepts user input.

The prompt determines the current interaction mode.

The terminal UI redraws as a stable screen rather than printing a transcript of
each interaction. The prompt remains at the bottom of the screen.

While the user is typing, the UI previews the inferred mode. Plan input previews
the parsed time box before it is committed.

Tab completion is available for commands, `:switch` session names, search
shortcuts, selection actions, visible result numbers, and known fact tags after
`@` in capture text.

---

# Prompt Modes

The mode is inferred from the first character entered.

| Prefix | Mode |
| --- | --- |
| none | Capture |
| / | Search |
| : | Command |
| ; | Plan |
| number or dots | Selection |

---

# Commands

| Command | Behavior |
| --- | --- |
| `:switch <session>` | Switches to the named session |
| `:session <number>` | Switches to a numbered session from `:sessions` |
| `:sessions` | Lists sessions discovered from fact folders and timebox files |
| `:inspect <number>` | Shows full metadata and file path for a visible fact |
| `:timebox <number> <range> <session>` | Updates a visible time box |
| `:timebox delete <number>` | Deletes a visible time box |
| `:undo` | Undoes the most recent selection action in memory |
| `:help` | Shows in-app help |
| `:restart` | Restarts the app, reloads current session/query, and clears transient panels |
| `:paste` | Prompts for a paste name, writes the clipboard into the current session, and creates a `type: file` fact |
| `:exit` / `:quit` | Exits the app |

---

# Configuration

Gatherbrain may load `gatherbrain.config.json` from the current working
directory. User config is merged over defaults.

Initial supported config:

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

The repository includes `gatherbrain.config.example.json` as a starter config.

---

# Capture Mode

Capture mode is the default.

Anything entered becomes a new fact.

Captured facts use the default type `fact` unless a later action changes the
type.

Example:

```text
Mike prefers async architecture reviews.
```

Creates a new fact in the current session.

---

# Search Mode

Search mode begins with `/`.

The entered query becomes the active query.

Examples:

```text
/Steve Ma

/"caesar salad"

/type:decision

/due:today and "Steve Ma"

/session:"Architecture Review Board"

/tag:Devin

/tag:Steve Ma
```

Search supports:

- terms
- quoted phrases
- field filters
- AND
- OR
- NOT
- parentheses

Adjacent terms imply AND.

Operator precedence:

1. NOT
2. AND
3. OR

---

## Search Shortcuts

Queries beginning with `//` reference named shortcuts.

A shortcut expands into a complete query before parsing.

Example:

```text
//current
```

expands to

```text
(type:todo or type:inprogress or type:waiting)
and due<=today
```

Shortcuts may reference dynamic values such as:

- current session
- today
- this week

Examples:

```text
//current

//today

//session

//overdue
```

---

# Command Mode

Command mode begins with `:`.

Commands change application state.

Initial commands:

```text
:switch <session>

:restart

:paste
```

### `:switch`

Changes the current session.

The current query becomes:

```text
session:<new session>
```

### `:restart`

In the interactive TUI, restarts the application process so code and
configuration changes are loaded. The restarted process reloads the saved
current session and query.

Transient state such as visible panels, selection previews, and undo history is
cleared. Durable workspace state, including facts, time boxes, and the current
session/query, is preserved.

### `:paste`

Prompts for a name for the pasted item.

The next entered line becomes both the fact title and the file-name stem.

The command requires a current session.

Clipboard text is saved as a `.txt` file in the current date/session folder.

Clipboard screenshots are saved as `.png` files in the current date/session
folder.

After writing the pasted file, the app creates a normal fact in the same session
with type `file`, the entered name as content, and `file: <filename>` in front
matter.

The pasted file and the fact are both stored under the current date/session
folder.

---

# Selection Mode

Selection mode begins with one or more numbers or dot sequences.

Examples:

```text
7

.

..

...

1 3 7

. ..
```

## Number selectors

Numbers refer to displayed fact numbers.

Fact numbers remain stable until the session or search changes.

Example:

```text
17
```

Selects fact number 17.

---

## Dot selectors

Dots refer to the nth visible item.

```text
.      first

..     second

...    third
```

---

## Selection Actions

Selection is a prefix for an action.

General form:

```text
<selectors> <action> [arguments]
```

Examples:

```text
. todo

. .. todo

7 tomorrow

3 delete

.. gather

. @Steve\ Ma
```

---

## Built-in Fact Actions

### Set due date

Assigns a due date.

Example:

```text
3 tomorrow
```

---

### Delete

Moves the fact into the `.trash` folder within its home session.

Example:

```text
5 delete
```

---

### Gather

Associates the selected fact with the current session.

Example:

```text
7 gather
```

---

### Change Type

Changes the fact type.

Example:

```text
. todo
```

---

### Add Tag

Adds a tag to the selected fact.

Escaped spaces are normalized the same way as capture text.

Example:

```text
. @Steve\ Ma
```

---

### Open File

Opens the file associated with the selected fact.

Example:

```text
. open
```

The selected fact must have a `file` front matter value. Relative file names are
resolved against the selected fact's own session folder.

---

# Action DSL

Selection actions are configurable.

Keywords map to actions.

Example configuration:

```yaml
actions:

  todo:
    action: set_type
    value: todo

  waiting:
    action: set_type
    value: waiting

  inprogress:
    action: set_type
    value: inprogress

  abandoned:
    action: set_type
    value: abandoned

  done:
    action: set_type
    value: done

  tomorrow:
    action: set_due
    value: tomorrow

  delete:
    action: trash

  gather:
    action: associate_current_session

  open:
    action: open_file
```

Example:

```text
. .. todo
```

expands conceptually to:

```text
Select first and second visible facts.

Set type = todo.
```

---

# Plan Mode

Plan mode begins with `;`.

Entering plan mode replaces the body with the calendar.

Planning commands associate dates and time ranges with sessions.

Example:

```text
; 9-10 Steve
```

The calendar updates immediately while typing.

The change is staged.

Nothing is committed until Enter is pressed.

Esc abandons the staged change.

Examples:

```text
; 9-10 Steve

; 11-12 Counterfact

; tomorrow 2-3 Reading
```

Plan mode creates and edits time boxes only.

It never creates facts.

Committed time boxes are persisted to the text file for the planned date.

---

# Interaction Philosophy

The interface follows five simple modes:

**Capture**

Remember something.

**Search**

Find something.

**Command**

Change application state.

**Selection**

Operate on existing facts.

**Plan**

Allocate time to sessions.

Together these modes provide a complete keyboard-first workflow for capturing knowledge, retrieving it, organizing it, and planning future work while keeping the underlying interaction model small and predictable.
