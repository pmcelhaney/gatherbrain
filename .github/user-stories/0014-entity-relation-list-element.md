# 0014 — `<entity-relation-list>` Custom Element

## Summary

As a user, I want an element that displays a list of related entities (relation-list properties) so that I can see and navigate relationships.

## Details

File: `src/elements/entity-relation-list.ts`

**Attributes:**
- `name` (required) — the frontmatter property key containing the relation list.
- `schema` (optional) — the target schema name, used for filtering picker suggestions.

**Behavior:**

- Extends `BaseElement`.
- In `onContextReady()`:
  - Reads `context.entity.frontmatter[name]` — this is a list of wikilinks (`[[Title]]` strings) or entity ids.
  - Resolves each wikilink to an entity via `context.store`.
  - Renders each resolved entity using its schema's `pickerTemplate` (if available) or a default `<span>` with the entity title.
  - If an entity cannot be resolved (broken link), renders the raw wikilink text with a "broken link" indicator.

**Rendering:**
- Wrap the list in a `<ul>` element.
- Each item is an `<li>` containing:
  - The rendered picker template for that entity.
  - A link (clickable title) that calls `context.router.navigateTo(entity.id)`.
  - A remove button (`×`) that removes the item from the list and calls `context.updateEntity`.

**Adding items:**
- Render an `<entity-picker>` element (story 0019) at the end of the list.
- When the picker emits an `entity-selected` event, add the selected entity to the list and save.

**Wikilink format:**
- Values stored as `[[Title]]` should be resolved via `context.store.findByTitle(title)`.
- When saving, write values back as `[[Title]]` (use the entity's `title` property).

**HTML usage:**
```html
<entity-relation-list name="attendees" schema="person"></entity-relation-list>
```

### Acceptance Criteria

- Given `attendees: ["[[John Smith]]", "[[Patrick McElhaney]]"]` in frontmatter, renders two list items with their titles linked.
- Clicking a linked title navigates to that entity's page.
- Clicking the remove button removes the item and updates the file.
- Adding via the picker adds the entity and updates the file.
- Broken wikilinks render with an indicator rather than throwing.
