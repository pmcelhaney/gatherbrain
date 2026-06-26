# Vision

`gatherbrain` starts as a terminal app, but the larger idea is not a terminal app and not a note-taking app. It is a context-centered working-memory layer.

Most personal computing is document-centered: files, pages, messages, tickets, and apps. Real work is often context-centered: a person, a project, a meeting, an incident, a question, or a temporary line of thought. `gatherbrain` treats those contexts as first-class places to think.

## The Direction

The current app already separates three layers:

1. **Durable persistence**: directories, Markdown, and front matter.
2. **Object model**: contexts, facts, properties, relations, lenses, and view models.
3. **Interaction surface**: the terminal UI, command DSL, templates, and editor handoff.

That separation points toward a broader architecture:

```text
LLM and other interfaces
        |
Working context
        |
Dashboard, conversation, commands, automations
        |
Gatherbrain API
        |
Object graph model
        |
Markdown persistence
```

The filesystem remains important, but it is not the product. It is the durable, inspectable persistence layer. The domain model is the object graph built from it.

## Why Stable Facts Matter

The core primitive is a fact with a stable identity.

Once a thought has an identity, it can:

- accumulate metadata,
- become related to contexts,
- become evidence for a claim,
- become actionable,
- be edited or moved without losing its history,
- appear in many lenses,
- be summarized or cited by an LLM,
- be used by another app without a custom export.

This is why `gatherbrain` prefers many small facts over large pages of prose. Atomic facts give software something meaningful to reason about.

## Contexts As Scopes

Contexts are implemented as directories, but conceptually they are scopes of attention.

For example:

```text
walgreens/
  enterprise-architecture/
    steve/
      meeting-july-2/
```

Each level narrows what is relevant. Today that mainly affects where facts live and what is visible. Later, scope could support inherited metadata, context summaries, scoped prompts, default relations, project dashboards, or LLM behavior tuned to the current context.

## Peek As Attention

Peek is not just a convenience command. It models a common attention pattern: looking at another context without leaving the one you are working in.

That matters for LLM and dashboard surfaces. A future interface should know both:

- where the user is working,
- what the user is temporarily attending to.

Those are different states, and they should stay different in the model.

## Lenses As APIs

A lens is currently a rendered view. Over time, lenses can also become API-shaped questions:

- What is due today?
- What changed in this context?
- What facts support this claim?
- What decisions are still open?
- What should I ask this person next time?

The same primitive supports terminal views, dashboards, summaries, command completions, and LLM prompts.

## Configuration As Local Semantics

The command, enum, lens, and template DSLs let users define their own semantics without changing the core app.

That matters because the system is personal. One workspace might use `todo`, `waiting`, and `done`. Another might use `claim`, `source`, `question`, and `decision`. The durable primitives remain the same, but the user's vocabulary shapes how the system behaves.

## What Gatherbrain Is Not

`gatherbrain` is not trying to be another PKM archive. It is also not trying to hide the filesystem behind a private database.

The aim is a working-memory substrate:

- fast capture,
- stable fact identity,
- context-aware retrieval,
- configurable semantics,
- open persistence,
- LLM-readable data,
- multiple possible interfaces over the same model.

The terminal UI is the first surface. The deeper product is the model that lets many tools participate in the user's working memory.
