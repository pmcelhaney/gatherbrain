# Gatherbrain Core Interaction Specification

This is the living project specification. It started from the original
interaction spec and should be updated as product and architecture decisions
are made.

## Implementation Target

Gatherbrain will be built in Node.js.

## Design Principles

Gatherbrain is a local-first terminal application for capturing knowledge while doing work.

The user is always working in a context.

Knowledge is captured as small facts.

Planning is managed independently through time boxes.

The interface is optimized for keyboard-first operation with minimal mode switching.

---

# Core Primitives

## Context

A context is the unit of work.

Every interaction occurs within a current context.

Examples:

- Steve
- Architecture Review Board
- Counterfact
- Reading: Team Topologies
- 2026-06-30 ARB Meeting

Contexts may be associated with facts and time boxes.

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
- home context
- associated contexts

Every fact belongs to exactly one home context.

A fact may be associated with zero or more additional contexts.

A fact may have zero or more tags. Tags and contexts share the same workspace
namespace. Tags are captured from `@` mentions in fact text, and `@` refers to a
context name. Escaped spaces are normalized when saving, so `@Steve\ Ma` stores
the tag `Steve Ma`. Possessives keep the suffix as text, so `@Devin's` stores
the tag `Devin`.

Tags may also be added to selected existing facts with selection input such as
`. @Steve\ Ma` or `1 @Steve\ Ma`.

Known tags are discovered from root-level workspace directories, the same way
contexts are discovered.

---

## Search

Search retrieves facts.

The current search determines what appears in the body of the interface.

An empty search prompt (`/`) refreshes the current query. If no current query
exists, it searches the current context. If there is no current context, it
lists all facts.

Search results are ordered newest first by fact creation time.

Search result rows show a fact's home context only when the fact is outside the
current context context. Facts that live in the current context or are associated
with the current context keep the compact current-context row.

Context search supports quoted values, unquoted multi-word context values, and
`@Context Name` shorthand.

Tag search supports `tag:<name>` field filters. Tags also participate in normal
term search.

---

## Time Box

A time box represents planned work.

A time box associates a date and period of time with a context.

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
    Architecture Review Board/
        6f2308de-02e9-45db-8ff0-65ac793f4a24-review.md
        9b099737-48ad-4b28-88d3-ae75c66c9e24-risk.md

    Steve/
        5ddbf77c-cd5e-4d9c-9906-4c18d3217b7a-follow-up.md

    Technology Assembly/
        2026-07-08/
            a75ee82c-6b89-4676-8cb1-01222f976885-prep.md
```

The home context is defined by the containing context directory. Slash-separated
context names are stored as nested directories, so a fact in
`Technology Assembly/2026-07-08` lives under that subdirectory. The home context
is not stored in front matter.

Each fact contains front matter similar to:

```yaml
---
id: 6f2308de-02e9-45db-8ff0-65ac793f4a24
type: observation
created: 2026-06-30T10:15:23-04:00
associated_contexts:
  - Steve
  - Enterprise Architecture
tags:
  - Devin
  - Steve Ma
due:
file:
url:
---
```

Deleted facts are moved into a `.trash` directory beneath their home context.

Example:

```text
<workspace>/
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
current_context
current_query
current_selection
current_mode
plan_preview
```

Definitions:

**current_context**

The context the user is currently working in.

A context must be entered before facts may be captured.

If captured text contains an `http://` or `https://` URL, the fact is captured
as `type: bookmark`. The first URL is stored in front matter as `url:` and is
removed from the fact body. The remaining text becomes the body. If the capture
contains only the URL, the body uses a readable host/path label while the full
URL remains only in front matter.

Natural language dates in captured text are normalized to `YYYY-MM-DD` before
storage. Supported input forms are `today`, `tomorrow`, `yesterday`,
`next <weekday>`, and month-day phrases such as `June 1`. Month-day phrases use
the current year. Stored ISO dates render back as natural labels in terminal
output.

**current_query**

The active search query.

The body always renders the results of this query.

Default:

```text
context:<current_context>
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

- current context
- active query
- current mode
- result count

The primary header form is a workspace-style path:

```text
contexts/Thinking about Gatherbrain design
```

---

## Body

Displays the result of the active query.

Normally this is a list of facts.

In plan mode it displays the calendar as a proportional timeline.

Fact rows are numbered at the left with a muted number prefix. The implicit
`fact` type is not shown. Other fact types are shown before the content.
Bookmark rows with a `url` front matter value render their content as a terminal
hyperlink to that URL.
Tags that are not already mentioned in the fact content are shown after the
content as `>Tag Name` in the tag color. Tags already mentioned inline are not
repeated at the end of the row.
When color is enabled, selected fact previews highlight the whole rendered fact
row, including colored type, due-date, and tag segments.

Timeline rows are spaced according to elapsed time. Busy time boxes use a solid
line and filled marker. Free time uses a dotted line and open marker with the
available duration. When the current time falls within the rendered day, the
timeline includes a current-time marker at the proportional position.

Due dates are displayed as friendly labels when possible:

- today
- tomorrow
- short weekday for nearby dates
- month and day for later dates

The same friendly display is applied to ISO dates found in fact content and
fact inspection output.

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

Tab completion is available for commands, `:switch` context names, search
shortcuts, selection actions, visible result numbers, and known context names
after `@` in capture text. When multiple candidates match the same typed
prefix, pressing Tab repeatedly cycles through the matching candidates.

While typing in the interactive prompt, `Ctrl+A` moves the cursor to the start
of the input and `Ctrl+E` moves the cursor to the end.

Cursor movement does not change the visible input text. At the start of a
non-empty prompt input, the cursor is shown over the first character.

---

# Prompt Modes

The mode is inferred from the first character entered.

| Prefix | Mode |
| --- | --- |
| none | Capture |
| / | Search |
| : | Command |
| ; | Plan |
| number or dots | Selection command |

---

# Commands

| Command | Behavior |
| --- | --- |
| `:switch <context>` | Switches to the named context |
| `:context <number>` | Switches to a numbered context from `:contexts` |
| `:contexts` | Lists contexts discovered from fact folders and timebox files |
| `:inspect <number>` | Shows full metadata and file path for a visible fact |
| `:timebox <number> <range> <context>` | Updates a visible time box |
| `:timebox delete <number>` | Deletes a visible time box |
| `:undo` | Undoes the most recent selection action in memory |
| `:help` | Shows in-app help |
| `:restart` | Restarts the app, reloads current context/query, and clears transient panels |
| `:paste` | Prompts for a paste name, writes the clipboard into the current context, and creates a `type: file` fact |
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

Creates a new fact in the current context.

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

/context:"Architecture Review Board"

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
(type:task or type:inprogress or type:waiting)
and due<=today
```

Shortcuts may reference dynamic values such as:

- current context
- today
- this week

Examples:

```text
//current

//today

//context

//overdue
```

---

# Command Mode

Command mode begins with `:`.

Commands change application state.

Initial commands:

```text
:switch <context>

:restart

:paste
```

### `:switch`

Changes the current context.

Shell-style escaped spaces are normalized before the context is stored, so
`:switch Steve\ Ma` switches to `Steve Ma`.

The current query becomes:

```text
context:<new context>
```

### `:restart`

In the interactive TUI, restarts the application process so code and
configuration changes are loaded. The restarted process reloads the saved
current context and query.

Transient state such as visible panels, selection previews, and undo history is
cleared. Durable workspace state, including facts, time boxes, and the current
context/query, is preserved.

### `:paste`

Prompts for a name for the pasted item.

The next entered line becomes both the fact title and the file-name stem.

The command requires a current context.

Clipboard text is saved as a `.txt` file in the current context folder.

Clipboard screenshots are saved as `.png` files in the current context folder.

After writing the pasted file, the app creates a normal fact in the same context
with type `file`, the entered name as content, and `file: <filename>` in front
matter.

The pasted file and the fact are both stored under the current context folder.

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

Fact numbers remain stable until the context or search changes.

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
. task

. .. task

7 tomorrow

. next Friday

. June 1

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
. next Friday
. June 1
```

---

### Delete

Moves the fact into the `.trash` folder within its home context.

Example:

```text
5 delete
```

---

### Gather

Associates the selected fact with the current context.

Example:

```text
7 gather
```

---

### Change Type

Changes the fact type.

Example:

```text
. task
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
resolved against the selected fact's own context folder.

---

### Edit Fact

Opens the selected fact's own Markdown file in `$EDITOR`.

Example:

```text
. edit
1 3 edit
```

Because the editor can only handle one Gatherbrain fact at a time, `edit`
applies only to the last mentioned fact in the selection command. In `1 3 edit`,
fact 3 is edited.

---

# Action DSL

Selection actions are configurable.

Keywords map to actions.

Example configuration:

```yaml
actions:

  task:
    action: set_type
    value: task

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
    action: associate_current_context

  open:
    action: open_file

  edit:
    action: edit_file
```

Example:

```text
. .. task
```

expands conceptually to:

```text
Select first and second visible facts.

Set type = task.
```

---

# Plan Mode

Plan mode begins with `;`.

Entering plan mode replaces the body with the calendar.

Planning commands associate dates and time ranges with contexts.

Plan dates accept `today`, `tomorrow`, `yesterday`, `next <weekday>`, explicit
`YYYY-MM-DD`, and month-day phrases such as `June 1`.

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

; next Friday 14:30-15:00 Reading

; June 1 9-10 Steve
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

Allocate time to contexts.

Together these modes provide a complete keyboard-first workflow for capturing knowledge, retrieving it, organizing it, and planning future work while keeping the underlying interaction model small and predictable.
