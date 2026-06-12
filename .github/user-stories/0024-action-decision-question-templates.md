# 0024 — Next Action, Decision, and Open Question Page Templates

## Summary

As a user, I want full page templates and summary templates for next-action, decision, and open-question entities so that I can view and update them.

## Details

Update the built-in schemas for `next-action`, `decision`, and `open-question` (story 0006) with fully functional templates.

---

### `next-action` Full Page Template

```html
<entity-page>
  <entity-title></entity-title>
  <div class="action-meta">
    <entity-select name="status"></entity-select>
    <entity-field name="due" mode="edit"></entity-field>
    <entity-field name="created"></entity-field>
    <entity-field name="source"></entity-field>
    <entity-relation-list name="collaborators" schema="person"></entity-relation-list>
  </div>
  <section class="action-notes">
    <h2>Related Notes</h2>
    <entity-related-notes></entity-related-notes>
  </section>
</entity-page>
```

**Summary Template** (used inline in meeting pages and other query results):

```html
<div class="action-summary">
  <entity-title></entity-title>
  <entity-select name="status"></entity-select>
</div>
```

This template intentionally allows inline status editing without opening the full page.

---

### `decision` Full Page Template

```html
<entity-page>
  <entity-title></entity-title>
  <div class="decision-meta">
    <entity-select name="status"></entity-select>
    <entity-field name="created"></entity-field>
    <entity-field name="source"></entity-field>
    <entity-relation-list name="references"></entity-relation-list>
  </div>
  <entity-markdown></entity-markdown>
</entity-page>
```

**Summary Template:**
```html
<div class="decision-summary">
  <entity-title></entity-title>
  <entity-field name="status"></entity-field>
</div>
```

---

### `open-question` Full Page Template

```html
<entity-page>
  <entity-title></entity-title>
  <div class="question-meta">
    <entity-select name="status"></entity-select>
    <entity-field name="created"></entity-field>
    <entity-field name="source"></entity-field>
    <entity-relation-list name="owner" schema="person"></entity-relation-list>
  </div>
  <entity-markdown></entity-markdown>
</entity-page>
```

**Summary Template:**
```html
<div class="question-summary">
  <entity-title></entity-title>
  <entity-field name="status"></entity-field>
</div>
```

---

### Acceptance Criteria

- Next action page shows: title, status dropdown, due date, collaborators, related notes.
- Changing status in the summary view (on meeting page) updates the file and reflects in UI immediately.
- Decision and open-question pages show their respective fields and status dropdowns.
- All summaryTemplates are compact enough to display in a list without scrolling.
