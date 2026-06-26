# Design Theory

`gatherbrain` is designed around a simple bet: a personal knowledge tool should behave less like a database you administer and more like a memory aid that stays close to your work.

This document explains that bet in plain language and connects it to cognitive science, personal information management, and human-computer interaction research. The research does not prove that this exact app is correct. It gives a defensible set of design pressures.

## The Short Version

People are not good at holding many unfinished thoughts in mind while also deciding how those thoughts should be organized. We are better at leaving useful cues for ourselves and returning to those cues later.

So `gatherbrain` is built to:

- make capture fast,
- keep notes close to the context where they arose,
- preserve source and relationship cues,
- let the same facts appear through multiple lenses,
- reduce memory burden with visible lists, completion, and stable item numbers,
- store everything in plain files so the system is inspectable and durable,
- let users configure their own semantics through small DSLs.

## Memory Is Cue-Driven

When you try to remember something, you are rarely pulling it from memory by brute force. You are using cues: the project, the person, the date, the place, the task, or the adjacent thought.

The encoding specificity principle, associated with Endel Tulving and Donald Thomson, says that retrieval works better when the cues available at recall overlap with the context present when the memory was formed. In plain terms: the situation around a memory matters.

`gatherbrain` turns that into a file model:

- The current directory is the current context.
- New facts go into that context by default.
- A peeked context becomes a relationship on the fact.
- `@context` references become Markdown links.

The app is not trying to guess the one true category. It is trying to preserve useful retrieval cues.

Further reading:

- [Tulving and Thomson, Encoding specificity and retrieval processes in episodic memory](https://doi.org/10.1037/h0020071)

## Working Memory Is Small

Classic work by George Miller popularized the idea that short-term memory has strong capacity limits. Later research, including Nelson Cowan's work, argues that the practical focus of attention is often closer to a few chunks than a long list.

You do not need to settle the exact number to design around the constraint. The important point is simpler: if the tool requires the user to remember the thought, the destination, the schema, and the next action all at once, the tool is spending scarce attention.

`gatherbrain` keeps the capture path short:

- Type the fact.
- Press Enter.
- The app creates a Markdown file in the current context.

The title is only a preview. The full thought goes in the body. That keeps the saved item readable without asking the user to write the perfect title up front.

Further reading:

- [Miller, The Magical Number Seven, Plus or Minus Two](https://psychclassics.yorku.ca/Miller/)
- [Cowan, The magical number 4 in short-term memory](https://doi.org/10.1017/S0140525X01003922)

## External Space Can Do Cognitive Work

David Kirsh's work on the intelligent use of space argues that people arrange the world to make thinking easier. We sort papers, lay things out, put reminders where we will see them, and use spatial arrangements to reduce internal computation.

The filesystem is already a spatial tool. Directories are places. Moving into a directory changes what feels relevant. `gatherbrain` leans into that instead of hiding it behind an opaque database.

Design consequences:

- Contexts are directories.
- Facts are files.
- Deleting moves a fact into `.trash` inside its context.
- Opening a context opens a real directory in the system file viewer.
- Importers and external editors can work with the same files.

Further reading:

- [Kirsh, The Intelligent Use of Space](https://doi.org/10.1016/0004-3702(94)00017-U)

## Re-Finding Is Different From Searching

Personal information management research distinguishes finding from re-finding. A lot of personal knowledge work is not "search the web for something new"; it is "get back to the thing I saw, wrote, decided, or half-understood before."

Re-finding often uses partial cues. You may remember the person, the project, the rough time, or the path you took, but not the exact words. `gatherbrain` supports that style:

- Contexts provide place cues.
- Related contexts provide association cues.
- Lenses provide task cues.
- Item numbers provide short-lived handles for action.
- Markdown files preserve source traces and bodies for later inspection.

The people importer follows the same principle. Each imported cell becomes its own fact so a later claim can point back to its source instead of being buried inside a large profile blob.

Further reading:

- [Jones et al., Personal Information Management](https://arxiv.org/abs/2107.03291)
- [Capra and Perez-Quinones, Re-Finding Found Things](https://arxiv.org/abs/cs/0310011)

## Lenses Ask Different Questions Of The Same Facts

A folder answers "where was this captured?" A lens answers "what question am I asking right now?"

Those are different jobs. A task might live in a project context, be related to a person, have a due date, and appear in `today`. Duplicating it into many places would create maintenance cost. A lens avoids that by rendering a view over the same fact.

This matches a common HCI idea from information foraging: people follow cues that suggest where useful information is likely to be. A good lens increases the scent for a specific job. `today` says "show me what needs attention now." `current` says "show me what still matters today, including done items touched today."

Further reading:

- [Information scent, Nielsen Norman Group](https://www.nngroup.com/articles/information-scent/)
- [Pirolli and Card, Information Foraging](https://dl.acm.org/doi/10.1145/223904.223911)

## Users Should Be Able To Build Their Own Semantics

Many knowledge tools make the app's categories feel like facts about the world. `gatherbrain` treats them as user vocabulary.

Commands, enums, lenses, and templates are configured through small JSON and Handlebars DSLs. That means a user can decide:

- which commands exist,
- which values are meaningful for command arguments,
- which facts count as visible for a lens,
- how a visible fact should be displayed.

This matters because personal knowledge work is personal. A useful system for one person might distinguish `waiting`, `blocked`, and `delegated`; another might care about `source`, `claim`, and `question`. The core app provides stable primitives, while configuration lets users build local semantics on top.

## Recognition Beats Recall

Interfaces are easier when they let people recognize options instead of forcing them to remember exact commands, names, or hidden state. Nielsen's usability heuristics phrase this as "recognition rather than recall."

`gatherbrain` still uses a command line because the target interaction is fast keyboard work. But it softens the recall burden:

- `Tab` completes command names.
- Prompted commands ask for one argument at a time.
- Fact arguments complete by visible title.
- Context and enum arguments complete from the model/config.
- Visible facts have stable item numbers until the context changes.
- The header always shows the current context, peek, and lens.

This is also why the body is rendered as simple text. The interface tries to keep the active memory load low.

Further reading:

- [Nielsen, 10 Usability Heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/)
- [Recognition vs. Recall in UX](https://www.nngroup.com/articles/recognition-and-recall/)

## Expert Flow Matters

Ben Shneiderman's work on direct manipulation emphasized visible objects, rapid feedback, reversibility, and user control. `gatherbrain` is not a graphical direct-manipulation app, but it borrows the underlying HCI values:

- The user acts on visible facts.
- Edits use `$EDITOR`, so the user stays in their chosen expert tool.
- Deletes are reversible enough for daily work because files move to `.trash`.
- `:restart` preserves UI state so development and use can happen together.
- Plain files keep the system inspectable and repairable.

The design accepts a tradeoff: commands require some learning, but they become efficient and predictable once learned.

Further reading:

- [Shneiderman, Direct Manipulation: A Step Beyond Programming Languages](https://doi.org/10.1109/MC.1983.1654471)

## Plain Text Keeps The System Open

`gatherbrain` is intentionally plain text. The durable data is Markdown files, front matter, and directories.

That choice is partly practical:

- users can read and edit facts without the app,
- `grep`, `ripgrep`, Git, backup tools, and shell scripts work naturally,
- multiple apps can interact with the same data,
- LLM tools can inspect, summarize, rewrite, classify, or link facts without a custom export path.

It is also philosophical. Unix systems are powerful because small tools can cooperate through files and streams. `gatherbrain` borrows that spirit for personal knowledge: keep the stored representation simple enough that the app is not the only thing that can understand it.

## Why Not A Rich Database?

A database can enforce more structure. But for this tool, strict structure is delayed until it earns its keep.

Plain Markdown facts keep the model simple:

- Contexts are directories.
- Facts are files.
- Properties are front matter.
- Relations are explicit context IDs.
- Views are computed from the model.

That simplicity is intentional. It lowers the cost of capture, makes data portable, and lets the user gradually add structure through types, due dates, relations, and lenses.

## Design Principles

| Principle | What it means in the app |
| --- | --- |
| Capture first, refine later | Plain text creates a fact immediately. |
| Context is a memory cue | New facts are stored in the current directory context. |
| Relationships should be explicit | Peek and `:relate` write `relatedContexts`. |
| Views should not duplicate data | Lenses render facts without moving them. |
| Semantics should be user-shaped | Commands, enums, lenses, and templates are configurable DSLs. |
| Recognition should help recall | Completion, visible lists, and stable item numbers reduce command burden. |
| Plain text should stay open | Markdown and directories stay visible to editors, scripts, search tools, and LLMs. |
| Source matters | Imports preserve source metadata at the fact level. |
