# Gatherbrain Core Interaction Specification

This is the living project specification. It should be updated as product and
architecture decisions change.

## Implementation Target

Gatherbrain is built in Node.js.

## Design Principles

Gatherbrain is a local-first terminal application for capturing knowledge while
doing work.

The user is always working in a context.

Knowledge is captured as small facts.

The interface is optimized for keyboard-first operation with minimal mode
switching.

---

# Core Concepts

Gatherbrain centers on a small set of concepts:

- Facts
- Contexts
- Capture
- Transient search
- Selection commands
- Tab completion

Fact associations, sometimes described as gathering, are part of the context
model: they let a fact remain owned by one home context while also appearing in
other relevant contexts.

Claiming is a selection-command move: it changes a selected fact's home context
to the current context instead of adding another association.

Tags and time boxes are not active product concepts.

## Context

A context is the unit of work. Every fact belongs to one home context.

Examples:

- Steve
- Architecture Review Board
- Reading: Team Topologies
- Technology Assembly/2026-07-08

Slash-separated context names are stored as nested directories.
Workspace directories are valid contexts even before they contain facts.

## Fact

A fact is a single unit of knowledge.

A fact has:

- id, stored as a UUID
- content
- type
- created timestamp
- optional due date
- optional associated file
- optional associated URL
- home context
- associated contexts

Every fact belongs to exactly one home context. A fact may be associated with
zero or more additional contexts through selection actions such as `gather`.
An association does not move or copy the fact; it adds another context where the
fact should be visible. A fact may be claimed into the current context through
the `claim` selection action, which moves the underlying Markdown file so that
the current context becomes the fact's home context.

There is no separate tag model. Text containing `@Steve` in captured content is
stored as normal fact content and also associates the fact with the referenced
context. Escaped spaces used while typing a multi-word reference, such as
`@Steve\ Ma`, are saved as plain spaces in the fact body.

## Capture

Capture is the default interaction. Plain prompt text creates a fact in the
current context.

Capture requires a current context. The context supplies the fact's storage
location and home context.

## Prompt History

Submitted non-empty prompt lines are kept in interactive prompt history for the
current TUI process. Up and Down navigate through that history without wrapping
past either end, and recalled lines place the cursor at the end of the prompt.

## Search

Search retrieves facts.

Search is transient. While a slash search is being typed, the body previews
matching results before Enter is pressed. Pressing Enter on a plain search
returns the body to the current context instead of making the search sticky.

An empty search prompt (`/`) previews the current context query. If there is no
current context, it previews all facts.

When there is a current context, search results are split into two groups with
a blank line between them. The first group contains facts whose home context is
the current context or whose associated contexts include the current context.
The second group contains every other matching fact. Each group is ordered
newest first by fact creation time.

Search result rows show a fact's home context as `[Home Context]` only when the
fact is not in the current context and is not associated with the current
context. Facts associated with the current context stay in the first group and
show their origin as a `<Home Context` suffix.

Associated contexts render as inline suffixes at the end of fact text, one
marker per context, such as `>Foo >Bar`. When color is enabled, these markers
use the same color as inline `@<context>` references. A context is omitted from
the suffix when the fact text already contains an inline
`@<context>` reference to that same context or when that context is the current
context being viewed. When a fact appears in a context because it is associated
with that context rather than living there, its home context renders as a
`<Home Context` suffix.

Context search supports quoted values, unquoted multi-word context values, and
`@Context Name` shorthand.

Supported field filters:

- `type:<value>`
- `context:<value>`
- `session:<value>` as a legacy alias for `context:<value>`
- `due:<date>` and due-date comparisons
- `content:<value>`

## Selection Commands

A selection command applies instructions to visible facts. It starts with one or
more selectors, such as result numbers or dots, followed by one or more actions.

Selection commands can operate on the current body, on a recent-context preview,
or on a transient search result set using the semicolon form:

```text
/context:Project\ Sapphire;1 5 gather
/context:Project\ Sapphire;1 5 claim
```

## Tab Completion

Tab completion keeps the keyboard interaction fast and predictable. Completion
applies to commands, context switches, search shortcuts, selection actions,
visible result numbers, and context names.

---

# Storage Model

Facts are stored as Markdown files with front matter.

Directory layout:

```text
<workspace>/
    Architecture Review Board/
        6f2308de-02e9-45db-8ff0-65ac793f4a24-review.md

    Steve/
        5ddbf77c-cd5e-4d9c-9906-4c18d3217b7a-follow-up.md

    Technology Assembly/
        2026-07-08/
            a75ee82c-6b89-4676-8cb1-01222f976885-prep.md
```

The home context is defined by the containing context directory. The home
context is not stored in front matter.

Each fact contains front matter similar to:

```yaml
---
id: 6f2308de-02e9-45db-8ff0-65ac793f4a24
type: observation
created: 2026-06-30T10:15:23-04:00
associated_contexts:
  - Steve
  - Enterprise Architecture
due:
file:
url:
---
```

Deleted facts are moved into a `.trash` directory beneath their home context.

---

# State Model

The application maintains:

- `current_context`
- `recent_contexts`
- `current_selection`
- `current_mode`

`current_mode` is one of:

- Capture
- Search
- Command
- Selection

---

# User Interface

The terminal UI has three regions.

## Header

The primary header form is the current context name:

```text
Thinking about Gatherbrain design
```

When the body is previewing a different context while the current context is
unchanged, the header shows the current context as a muted parent followed by
the viewed context:

```text
Steve Ma > Gatherbrain
```

## Body

The body displays current-context facts, transient search results, recent
context lists, help, or selection previews.

Fact rows are numbered at the left with a muted number prefix. The implicit
`fact` type is not shown. Other fact types are shown before the content.
Bookmark rows with a `url` front matter value render their content as a terminal
hyperlink to that URL.

When color is enabled, inline `@<context>` text is highlighted as a context
reference.

Facts associated with the viewed context but stored in another home context show
that origin at the end of the row as `<Home Context`. When color is enabled,
this origin suffix uses the same green as associated-context suffixes.

Due dates are displayed as friendly labels when possible:

- today
- tomorrow
- short weekday for nearby dates
- month and day for later dates

The same friendly display is applied to ISO dates found in fact content.

When color is enabled, selected fact previews highlight the whole rendered fact
row, including colored type and due-date segments.

## Prompt

The prompt accepts user input and previews the inferred mode while typing.

When the first prompt character is `@`, the body previews the most recently
visited contexts other than the current context, ordered newest first. The list
shows as many contexts as fit in the body. Recent contexts are remembered
between application sessions. Restored recent-context entries are used only
when they still resolve to a workspace context directory or a fact's home or
associated context.

Tab completion is available for commands, `@<context>` switches, inline
`@<context>` references in capture text, search shortcuts, selection actions,
visible result numbers, and context names. Context completions include contexts
discovered from directories under `workspace/contexts/` and contexts already
referenced by facts. Highlighting a leading context switch completion previews
that context in the header and body.

For leading `@<context>` switches, an exact typed context name takes precedence
over longer context names with the same prefix. For example, if both `ARB` and
`ARB 2.0` exist, submitting `@ARB` switches to `ARB`; `ARB 2.0` is selected only
when its Tab completion is highlighted or otherwise typed explicitly.

When multiple candidates match the same typed prefix, the first Tab completes
any shared prefix and later Tab presses cycle through the matching candidates.
The typed prefix keeps the cursor in place while the recommended completion
suffix is shown in gray. Multiple matches are shown in a compact candidate line
above the prompt.

Typing another character while a recommendation is visible keeps completion
active and narrows the candidate list from the original typed prefix plus the
new character.

`Right` or `Ctrl+F` accepts a visible recommendation so typing can continue
after the completed text.

---

# Prompt Modes

The mode is inferred from the first character entered.

| Prefix | Mode |
| --- | --- |
| none or `;` | Capture |
| `/` | Search |
| `:` or leading `@` | Command |
| number or dots | Selection command |

---

# Commands

| Command | Behavior |
| --- | --- |
| `@<context>` | Switches to the named context if it exists under `workspace/contexts/` or is already referenced by a fact |
| `@<context>!` | Creates the named context if needed, then switches to it |
| `@<number>` | Switches to a numbered context from the current `@` preview list |
| `@<dots>` | Switches to a dot-selected context from the current `@` preview list |
| `@<number-or-dots-or-context> <selectors> <actions>` | Applies selection actions inside that context, then keeps the original context active |
| `:undo` | Undoes the most recent selection action in memory |
| `:help` | Shows in-app help |
| `:restart` | Restarts the app, reloads the current context, and clears transient panels |
| `:paste` | Prompts for a paste name, writes the clipboard into the current context, and creates a `type: file` fact |
| `:exit` / `:quit` | Exits the app |

---

# Capture Mode

Capture mode is the default. Anything entered becomes a new fact in the current
context.

If captured text contains an `http://` or `https://` URL, the fact is captured
as `type: bookmark`. The first URL is stored in front matter as `url:` and is
removed from the fact body.

Natural language dates in captured text are normalized to `YYYY-MM-DD` before
storage. Supported input forms are `today`, `tomorrow`, `yesterday`, weekdays,
`next <weekday>`, and month-day phrases such as `June 1`.

---

# Search Mode

Search mode begins with `/`.

Examples:

```text
/Steve Ma
/"caesar salad"
/type:decision
/due:today and "Steve Ma"
/context:"Architecture Review Board"
/@Architecture Review Board
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

Queries beginning with `//` reference named shortcuts such as `//current`,
`//today`, and `//overdue`. Default shortcuts live in `gatherbrain.config.json`
and may be extended or overridden there.

---

# Selection Mode

Selection mode begins with one or more numbers or dot sequences.

Examples:

```text
7
.
..
1 3 7
```

Selection is a prefix for an action.

General form:

```text
<selectors> <action> [arguments]
@<number-or-dots> <selectors> <action> [arguments]
/search query;<selectors> <action> [arguments]
```

Multiple actions may be chained in the same prompt:

```text
3 task today
. waiting tomorrow
```

Built-in actions:

| Action | Behavior |
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
| `gather` | Associates the selected fact with the current context |
| `claim` | Moves the selected fact to the current context as its home context |
| `go` | Switches to the home context of the last selected fact |
| `@<context>` | Adds an associated context to the selected fact |
| `-@<context>` | Removes an associated context from the selected fact |
| `open` | Opens the URL, file, or both associated with the fact |
| `edit` | Opens the fact Markdown file in `$EDITOR`; with multiple selectors, only the last mentioned fact is edited |

---

# Configuration

Gatherbrain may load `gatherbrain.config.json` from the current working
directory. User config is merged over defaults.

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

---

# Interaction Philosophy

The interface follows four simple modes:

**Capture**

Remember something.

**Search**

Find something.

**Command**

Change application state.

**Selection**

Operate on existing facts.
