# Vision

`gatherbrain` is a local-first working-memory layer.

It starts as a terminal app because the terminal is fast, composable, and close to the rest of the tools people already use. The larger idea is not a terminal app, and it is not just a note-taking app. The larger idea is a context-centered substrate for attention, memory, planning, and tool cooperation.

Most software is organized around documents, apps, messages, tickets, and databases. Real work is often organized around situations: a person, a project, a meeting, a question, a decision, a source, a commitment, or the thing you are trying not to forget while doing something else.

`gatherbrain` treats those situations as first-class places to think.

## The Current Shape

The app has a small set of durable primitives:

- A **context** is where you are. It maps to a directory under the workspace root.
- A **fact** is one thing worth remembering. It is stored as a Markdown file with front matter.
- A **relation** connects a fact to another context.
- A **peek** is what you are looking at without leaving where you are.
- A **lens** asks a question of the current visible facts.
- A **timebox** says which context should own a span of time.
- An **event** records that the app changed state, changed view, or invoked an external tool.

The storage is plain text. The running app loads that text into an in-memory model. The interface renders from the model, mutates files through command-facing APIs, refreshes the model, and watches the workspace for outside changes.

That gives the system three layers:

1. **Persistence**: directories, Markdown, front matter, TSV logs, and TSV timeboxes.
2. **Model**: contexts, facts, relations, properties, lenses, timeboxes, and events.
3. **Interfaces**: the TUI today; later, dashboards, scripts, LLM agents, editors, or other apps.

The filesystem remains important because it keeps the data inspectable and tool-friendly. But the deeper product is the model built on top of it.

For a separate reminder of ideas that shaped this direction, see [Inspiration](inspiration.md).

## Why Facts Have Identity

The core move is giving a thought a stable handle.

In the object model, a fact is addressed by its workspace-relative Markdown path. In the file itself, a UUID gives the fact a durable identifier that can survive moves and be useful to other tools.

Once a thought has identity, it can:

- accumulate type, due dates, source data, and other properties,
- become related to contexts,
- move without losing provenance,
- become evidence for a claim,
- become actionable,
- be edited in `$EDITOR`,
- be opened by another tool,
- appear in multiple lenses,
- be summarized, linked, or transformed by an LLM.

This is why Gatherbrain prefers many small facts over large pages. A page is easy for a person to read, but an atomic fact is easier for a system to route, filter, cite, move, relate, and revisit.

## Context Is Not Category

A category says what something is. A context says where it matters.

This difference is important. A fact can be a `todo`, live in a project context, be related to a person, have a due date, and appear in a `today` lens. Those are not competing folders. They are different ways the fact can be useful.

Contexts are nested scopes of attention:

```text
customer/
  architecture-review/
    2026-06-27/
      follow-up.md
```

The path tells a story: this came up in a particular place, inside a particular stream of work. That path is a retrieval cue, not just storage.

## Peek Is Divided Attention Made Explicit

People often look aside without changing tasks. You are in a project, but you need to glance at a person. You are in a meeting, but you need to look at a source. You are planning the day, but one block points back to a different context.

Peek captures that distinction.

When peek is active:

- the screen renders the peeked context,
- new facts still go into the current context,
- those new facts are related to the peeked context,
- the peeked context has its own lens state.

The model therefore knows both "where I am" and "what I am looking at." That distinction is small, but it is the difference between replacing attention and layering attention.

## Lenses Are Questions

A lens is not just a display mode. It is a question asked against the model.

- `all`: what is visible here?
- `todo`: what might need action?
- `due`: what has a due date and is not done?
- `today`: what is due now or overdue?
- `current`: what belongs in today's working set, including done items touched today?

Because lenses do not move facts, the same fact can answer several questions without duplication. This is where the system starts to feel less like folders and more like an attention engine.

## Timeboxes Are Intentions

Facts remember what has been noticed. Timeboxes describe what should receive attention next.

The planner is intentionally separate from facts. A timebox does not edit a project note. It appends a row to a day file:

```text
/project/deep-work  09:00  11:00
```

Timeboxes are overlays. Newer rows win when ranges overlap. That makes planning cheap: you do not have to split the old plan perfectly before adding a new interruption. The planner resolves the current owner of time when needed.

This is where time planning meets a context model. A calendar says what is scheduled. Gatherbrain asks which context should own your attention right now.

## Configuration Is Local Semantics

The command, enum, lens, settings, and template files are a small DSL for personal semantics.

One workspace might use `todo`, `waiting`, `in progress`, and `done`. Another might use `claim`, `source`, `question`, and `decision`. A team workspace might use different lenses than a personal one. The app should not pretend its default vocabulary is universal.

The primitives stay stable:

- contexts,
- facts,
- properties,
- relations,
- lenses,
- timeboxes,
- events.

The user's vocabulary sits on top.

## Plain Text Makes It Bigger Than The App

The data is useful even when the TUI is closed.

Markdown files can be edited directly. Front matter can be searched. TSV logs can be analyzed. Timeboxes can be generated by another script. Git can show history. LLM tools can read the workspace without a custom API. Other apps can cooperate by writing the same plain formats.

That openness is part of the vision. Gatherbrain should be one good interface over a durable working-memory substrate, not the only door into it.

## The Direction

The current terminal app is the first surface. The long-term direction is a set of interoperable surfaces over the same model:

```text
TUI, editor, scripts, dashboards, LLM agents
                 |
          Gatherbrain API
                 |
        In-memory object model
                 |
 Markdown, JSON config, TSV logs, TSV timeboxes
```

The app should keep getting better at fast capture, context-aware retrieval, planning, traceability, and local semantics. The deeper goal is to help a person stay situated: to know where they are, what they are attending to, what matters now, and which small facts can support the next move.
