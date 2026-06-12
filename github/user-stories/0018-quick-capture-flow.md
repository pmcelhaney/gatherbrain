# 0018 — Quick Capture: Create Captured Note on Enter

## Summary

As a user, I want to type a note in a quick capture box and press Enter to instantly create a linked captured-note entity so that I can capture thoughts without leaving the current page.

## Details

This story implements the end-to-end quick capture flow. It depends on the auto-linker (story 0017) and entity file writing (story 0008).

### `<quick-capture>` Custom Element

File: `src/elements/quick-capture.ts`

**Behavior:**

- Extends `BaseElement`.
- Renders a single-line text input (or `<textarea>` that auto-expands) with placeholder text like "Capture a note…".
- On `Enter` (single line) or `Shift+Enter` for multi-line submit:
  1. Read the input text.
  2. If the text is empty, do nothing.
  3. Run `autoLink(text, context.store)` to detect and link entity references.
  4. Parse the linked text to extract all `[[Title]]` references; resolve each to an entity id.
  5. Build the new entity's frontmatter:
     ```yaml
     id: note_{timestamp}_{random4chars}
     schema: captured-note
     title: {original unlinked text}
     created: {ISO datetime}
     source: "[[{currentEntity.title}]]"
     references:
       - "[[ReferencedTitle1]]"
       - "[[ReferencedTitle2]]"
     ```
  6. Build the body as the auto-linked text (with wikilinks).
  7. Determine the file path using `capturedNoteFilePath(currentEntity, now, title)` (story 0008).
  8. Call `context.store.createEntity(...)` to write the file.
  9. Dispatch a `entity-created` custom event on `document`.
  10. Clear the input.
- After creation, any `<entity-query>` elements on the page should re-run their queries (they listen to `entity-created`).

**HTML usage:**
```html
<quick-capture></quick-capture>
```

### ID Generation

```ts
function generateNoteId(createdAt: Date): string;
// Returns e.g. "note_20260612_091500_abcd"
// Last 4 chars are random alphanumeric for collision avoidance.
```

### Acceptance Criteria (mirrors spec section 19)

Given:
- Current page: EA Core Weekly
- Existing entities: John Smith (alias: John), Tech Assembly

When user types "Send John the Tech Assembly agenda" and presses Enter:

- A new Markdown file is created at `Entities/Meetings/EA Core Weekly/2026-06-12-091500-send-john-the-tech-assembly-agenda.md`.
- The file's frontmatter contains:
  - `schema: captured-note`
  - `source: "[[EA Core Weekly]]"`
  - `references: ["[[John Smith]]", "[[Tech Assembly]]"]`
- The file's body contains `Send [[John Smith]] the [[Tech Assembly]] agenda`.
- The input is cleared after capture.
- The page's related notes list updates to show the new note.
