# 0025 — Captured Note and Topic Page Templates

## Summary

As a user, I want full page templates for captured-note and a generic topic entity so that all core entity types have a usable view.

## Details

### `captured-note` Full Page Template

```html
<entity-page>
  <entity-title></entity-title>
  <div class="note-meta">
    <entity-field name="created"></entity-field>
    <entity-field name="source"></entity-field>
    <entity-relation-list name="references"></entity-relation-list>
  </div>
  <entity-markdown></entity-markdown>
</entity-page>
```

**Summary Template** (used in related notes lists):

```html
<div class="note-summary">
  <span class="note-summary__date"><entity-field name="created"></entity-field></span>
  <a class="note-summary__title"><entity-title></entity-title></a>
  <span class="note-summary__source">Source: <entity-field name="source"></entity-field></span>
</div>
```

**Picker Template:**
```html
<span class="note-picker">
  <entity-title></entity-title>
  <small><entity-field name="created"></entity-field></small>
</span>
```

---

### `topic` Schema (new built-in schema)

Add a `topic` schema to the built-ins list (story 0006). Topics are general subjects, projects, or areas of interest.

**Properties:**
- `title` (string, required)
- `aliases` (string list or relation-list)
- `description` (text)

**Folder:** `Entities/Topics`

**Full Page Template:**

```html
<entity-page>
  <entity-title></entity-title>
  <entity-markdown field="description"></entity-markdown>
  <section>
    <h2>Related Notes</h2>
    <entity-related-notes></entity-related-notes>
  </section>
</entity-page>
```

**Summary Template:**
```html
<div class="topic-summary">
  <a class="topic-summary__title"><entity-title></entity-title></a>
</div>
```

**Picker Template:**
```html
<span class="topic-picker"><entity-title></entity-title></span>
```

---

### Acceptance Criteria

- A captured-note page shows: title, created time, source link, references list, and Markdown body with wikilinks rendered.
- The note summary template (used in related notes) shows date, title, and source compactly.
- A topic page shows: title, description, and related notes.
- The Tech Assembly topic page shows the "Send John the Tech Assembly agenda" note after capture (because it's in `references`).
