# Design Theory

`gatherbrain` is built around a simple claim: the useful unit of personal computing is often not a document, but a small fact captured inside a context of attention.

This document explains the design in plain language and connects it to cognitive science, personal information management, and human-computer interaction. The research is not decoration. It names the pressures the app is trying to respect: limited working memory, cue-driven recall, attention shifts, re-finding, and recognition over recall.

## The Short Version

People do not work from perfectly organized archives. They move through situations: a project, a person, a meeting, an incident, a question. Useful memory tools should preserve those situations without demanding too much structure at capture time.

`gatherbrain` is built to:

- make capture fast,
- give every fact a stable identity,
- keep facts close to the scope where they arose,
- preserve source and relationship cues,
- model temporary attention with peek,
- let lenses ask task-specific questions of the same facts,
- plan attention by assigning time to contexts,
- preserve a simple event trail for state and view changes,
- reduce memory burden with completion, visible lists, and stable item numbers,
- keep durable data open to editors, scripts, search tools, and LLMs,
- let users configure their own semantics through small DSLs.

For a separate reminder of ideas that shaped the app, see [Inspiration](inspiration.md).

## Working Memory Is The Bottleneck

The first design constraint is attention. If a tool asks you to remember the thought, choose the right destination, pick the right schema, invent a good title, and decide the next action before saving anything, the tool is spending the scarce resource it is supposed to protect.

`gatherbrain` keeps the capture path short:

- Type the fact.
- Press Enter.
- The app writes it into the current context.

The title is only a preview. The full thought goes in the body. Metadata can be added later through commands, types, dates, relations, importers, or other tools.

This is grounded in the broad lesson from working-memory research: the exact capacity number is less important than the fact that active attention is limited. Good tools should spend as little of it as possible.

Further reading:

- [Miller, The Magical Number Seven, Plus or Minus Two](https://psychclassics.yorku.ca/Miller/)
- [Cowan, The magical number 4 in short-term memory](https://doi.org/10.1017/S0140525X01003922)

## Contexts Are Scopes Of Attention

A context is implemented as a directory, but conceptually it is a scope: where you are, what is relevant, and what cues should surround new facts.

That matters because memory is cue-driven. When you try to remember something, you often use surrounding cues: the project, the person, the date, the meeting, or the adjacent thought. The encoding specificity principle says retrieval works better when recall cues overlap with the context present when the memory was formed. In plain terms: where and why something came up matters.

`gatherbrain` turns that into a concrete model:

- The current context is the default home for new facts.
- Nested contexts represent narrower scopes of attention.
- A peeked context becomes a relationship on a new fact.
- `@context` references become durable links.

The app is not trying to guess the one true category. It is trying to preserve useful retrieval cues.

Further reading:

- [Tulving and Thomson, Encoding specificity and retrieval processes in episodic memory](https://doi.org/10.1037/h0020071)

## Stable Fact Identity Is The Core Primitive

Tiny facts look unusual if you think in documents. They make more sense if you think in identities.

Once a thought has a stable ID, it can:

- accumulate metadata,
- become related to people, projects, meetings, and source contexts,
- become actionable,
- become evidence,
- be edited without losing its identity,
- appear in multiple lenses,
- be cited, summarized, merged, or transformed by other tools.

In the current implementation, the fact's model ID is its workspace-relative file path. Each fact also has a front matter UUID, which gives other tools a durable identifier that can survive moves. Markdown is the serialization format. Durable identity is the deeper design choice.

Moving a fact preserves this idea. The file can move to a better context, while `relatedContexts` records where it came from. Reorganization should add provenance, not erase it.

## Peek Models Temporary Attention

Work often involves looking aside without actually switching tasks.

You may be in a project context and briefly need to think about a person. You have not left the project. The person is temporarily relevant. That is what peek models.

When peek is active:

- the UI shows another context,
- the current context remains where new facts are created,
- new facts are automatically related to the peeked context,
- the peeked context has its own lens state.

This keeps the distinction between "where I am working" and "what I am looking at." That distinction is important because attention is not the same as location.

## Lenses Ask Questions Without Moving Facts

A context answers "where did this arise?" A lens answers "what am I trying to do right now?"

Those are different questions. A task might live in a project context, be related to a person, have a due date, and appear in `today`. Duplicating it into many places would create maintenance cost. A lens avoids that by rendering a view over the same fact.

This matches a useful lesson from information foraging: people follow cues that suggest where useful information is likely to be. A good lens increases the signal for a specific job.

- `todo` asks what still needs attention.
- `due` asks what has a due date and is not done.
- `today` asks what is due now or overdue.
- `current` asks what matters today, including done items touched today.

Further reading:

- [Information scent, Nielsen Norman Group](https://www.nngroup.com/articles/information-scent/)
- [Pirolli and Card, Information Foraging](https://dl.acm.org/doi/10.1145/223904.223911)

## Re-Finding Matters More Than Perfect Search

Personal information management research distinguishes finding from re-finding. A lot of knowledge work is not "search the web for something new"; it is "get back to the thing I saw, wrote, decided, or half-understood before."

Re-finding often starts from partial cues. You may remember the person, the project, the rough time, the meeting, or the kind of thing it was, but not the exact words.

`gatherbrain` supports that style:

- Contexts provide place cues.
- Related contexts provide association cues.
- Lenses provide task cues.
- Item numbers provide short-lived handles for action.
- Markdown bodies preserve the original source text.
- File paths provide durable IDs that other tools can reference.
- UUIDs provide stable identifiers that can survive path changes.

Further reading:

- [Jones et al., Personal Information Management](https://arxiv.org/abs/2107.03291)
- [Capra and Perez-Quinones, Re-Finding Found Things](https://arxiv.org/abs/cs/0310011)

## Recognition Beats Recall

Interfaces are easier when they let people recognize options instead of forcing them to remember exact commands, names, or hidden state. Nielsen's usability heuristics phrase this as "recognition rather than recall."

`gatherbrain` still uses a command line because the target interaction is fast keyboard work. But it softens the recall burden:

- `Tab` completes command names.
- Prompted commands ask for one argument at a time.
- Fact arguments complete by visible title.
- Context and enum arguments complete from the model/config.
- Visible facts have stable item numbers until the context changes.
- The header always shows the current context, peek, and lens.

Further reading:

- [Nielsen, 10 Usability Heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/)
- [Recognition vs. Recall in UX](https://www.nngroup.com/articles/recognition-and-recall/)

## Users Should Define Their Own Semantics

Many knowledge tools make the app's categories feel like facts about the world. `gatherbrain` treats them as user vocabulary.

Commands, enums, lenses, and templates are configured through small JSON and Handlebars DSLs. That means a user can decide:

- which commands exist,
- which values are meaningful for command arguments,
- which facts count as visible for a lens,
- how a visible fact should be displayed.

This matters because personal knowledge work is personal. A useful system for one person might distinguish `waiting`, `blocked`, and `delegated`; another might care about `source`, `claim`, and `question`. The core app provides stable primitives, while configuration lets users build local semantics on top.

## Planning Is Part Of Memory

A memory system is more useful when it can shape attention, not only retrieve old information.

The timebox planner treats planned attention as part of the workspace model: decide what kind of work should own a period of the day. Gatherbrain makes the owner a context, not just a calendar label.

That has two consequences:

- `:plan` connects planned time to the same context tree that stores facts.
- `:now` can move the user to the context that owns the present moment.

Timeboxes are overlays rather than destructive edits. Adding a new timebox appends a row. If it overlaps an older row, the last matching row wins. This keeps planning cheap and preserves the record of how the plan changed.

Free time is represented in the resolved view, but it is not stored as a timebox. The root context `/` is the fallback whenever no planned context claims a moment.

## Event Trails Make The System Inspectable

Gatherbrain logs user-visible state changes, view changes, planner changes, and external tool actions to daily TSV files.

This is not meant to be a heavyweight audit database. It is a simple trail:

- what changed,
- when it changed,
- the relevant metadata.

The event log fits the same philosophy as the rest of the app: keep durable traces plain enough that scripts, Git, and LLM tools can inspect them later.

## Plain Text Keeps The System Open

The filesystem is not the product. It is the persistence layer.

That persistence layer is intentionally plain: directories, Markdown, and front matter. This keeps the system open:

- users can read and edit facts without the app,
- `grep`, `ripgrep`, Git, backup tools, and shell scripts work naturally,
- multiple apps can interact with the same data,
- LLM tools can inspect, summarize, rewrite, classify, or link facts without a custom export path.

This is the Unix influence: keep the durable representation simple enough that other tools can participate.

## Expert Flow Matters

The design accepts that commands require some learning. In return, it keeps the main loop predictable and fast.

- The user acts on visible facts.
- Edits use `$EDITOR`, so the user stays in their chosen expert tool.
- Deletes move files to `.trash`.
- `:restart` preserves UI state so development and use can happen together.
- Configuration can evolve while the app is running.

This borrows from the HCI value behind direct manipulation: visible objects, rapid feedback, user control, and reversible-enough actions.

Further reading:

- [Shneiderman, Direct Manipulation: A Step Beyond Programming Languages](https://doi.org/10.1109/MC.1983.1654471)

## Design Principles

| Principle | What it means in the app |
| --- | --- |
| Capture first, refine later | Plain text creates a fact immediately. |
| Context is a scope of attention | New facts are stored in the current directory context. |
| Facts need stable identities | Each fact has a workspace-relative path ID and a front matter UUID. |
| Attention can look aside | Peek relates new facts to what the user is looking at without changing where they are. |
| Views should not duplicate data | Lenses render facts without moving them. |
| Relationships should be explicit | Peek, item update shorthand, and `:move` write `relatedContexts`. |
| Planning should follow context | Timeboxes assign focus time to contexts and `:now` switches to the current owner of time. |
| Trails should be inspectable | Event logs are daily TSV files with JSON metadata. |
| Semantics should be user-shaped | Commands, enums, lenses, and templates are configurable DSLs. |
| Recognition should help recall | Completion, visible lists, and stable item numbers reduce command burden. |
| Plain text should stay open | Markdown and directories stay visible to editors, scripts, search tools, and LLMs. |
| Source matters | Imports preserve source metadata at the fact level. |
