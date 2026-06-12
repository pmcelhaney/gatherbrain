# 0012 — `<entity-page>` and `<entity-title>` Custom Elements

## Summary

As a user, I want an entity page wrapper that provides layout and a title element that displays (and optionally edits) the entity title.

## Details

### `<entity-page>`

File: `src/elements/entity-page.ts`

The outermost wrapper element for a rendered entity page. Provides semantic structure and can apply base styles.

**Behavior:**
- Extends `BaseElement`.
- In `onContextReady()`, adds a CSS class based on schema name (e.g., `entity-page--meeting`).
- Renders a default slot so child elements defined in the template are shown as-is.
- Optionally renders a back button that calls `context.router.back()`.

**HTML usage:**
```html
<entity-page>
  <!-- children from schema template -->
</entity-page>
```

---

### `<entity-title>`

File: `src/elements/entity-title.ts`

Displays the entity's title. Optionally allows editing.

**Attributes:**
- `editable` (boolean, default `true`) — when present, the title is a contenteditable element.

**Behavior:**
- Extends `BaseElement`.
- In `onContextReady()`, renders the current entity's `title`.
- When `editable` is true:
  - Renders an `<h1>` with `contenteditable="true"`.
  - On `blur`, calls `context.updateEntity(entity.id, { title: newTitle })`.
- When `editable` is false or absent:
  - Renders a plain `<h1>` with the title text.

**HTML usage:**
```html
<entity-title></entity-title>
<entity-title editable="false"></entity-title>
```

---

### Registration

Both elements must be registered in `src/elements/index.ts`:
```ts
customElements.define('entity-page', EntityPage);
customElements.define('entity-title', EntityTitle);
```

`src/elements/index.ts` is the central file that registers all custom elements. Call it once during app boot.

### Acceptance Criteria

- `<entity-page>` renders its children without altering their layout.
- `<entity-title>` displays the entity title from context.
- Editing the title (blur) updates the frontmatter `title` field and the in-memory store.
- Setting `editable="false"` renders a non-editable heading.
- Elements do not error if context has not yet been injected.
