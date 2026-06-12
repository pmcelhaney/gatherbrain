# 0023 — Person Page Template

## Summary

As a user, I want a Person entity page that shows the person's details, next actions involving them, and related notes mentioning them.

## Details

Update the built-in `person` schema (story 0006) with a fully functional `fullPageTemplate`, `summaryTemplate`, and `pickerTemplate`.

### Full Page Template

```html
<entity-page>
  <entity-title></entity-title>
  <div class="person-meta">
    <entity-field name="email" mode="edit"></entity-field>
    <entity-field name="role" mode="edit"></entity-field>
  </div>
  <section class="person-actions">
    <h2>Next Actions</h2>
    <entity-query
      schema="next-action"
      where="collaborators includes current"
      sort="created desc"
      empty-message="No next actions"
    ></entity-query>
  </section>
  <section class="person-notes">
    <h2>Related Notes</h2>
    <entity-related-notes></entity-related-notes>
  </section>
</entity-page>
```

### Summary Template

```html
<div class="person-summary">
  <a class="person-summary__name"><entity-title></entity-title></a>
  <span class="person-summary__role"><entity-field name="role"></entity-field></span>
</div>
```

### Picker Template

```html
<span class="person-picker">
  <entity-title></entity-title>
  <small><entity-field name="role"></entity-field></small>
</span>
```

### Acceptance Criteria

- A person entity page renders name (editable), email, role, next actions involving them, and related notes mentioning them.
- Related notes that contain `[[Person Name]]` in `references` appear on the person's page.
- Next actions with that person in `collaborators` appear in the "Next Actions" section.
- Empty sections show appropriate empty-state messages.
