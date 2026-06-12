# 0022 — Meeting Page Template

## Summary

As a user, I want the Meeting entity page to show the meeting's key information, quick capture, next actions, decisions, open questions, and related notes so that I can manage all meeting work from one page.

## Details

Update the built-in `meeting` schema (story 0006) with a fully functional `fullPageTemplate` and `summaryTemplate`.

### Full Page Template

```html
<entity-page>
  <entity-title></entity-title>
  <div class="meeting-meta">
    <entity-field name="start" mode="edit"></entity-field>
    <entity-field name="end" mode="edit"></entity-field>
    <entity-relation-list name="attendees" schema="person"></entity-relation-list>
  </div>
  <section class="meeting-agenda">
    <h2>Agenda</h2>
    <entity-markdown field="agenda"></entity-markdown>
  </section>
  <section class="meeting-capture">
    <h2>Capture</h2>
    <quick-capture></quick-capture>
  </section>
  <section class="meeting-actions">
    <h2>Next Actions</h2>
    <entity-query
      schema="next-action"
      where="source=current"
      sort="created desc"
      empty-message="No next actions"
    ></entity-query>
  </section>
  <section class="meeting-decisions">
    <h2>Decisions</h2>
    <entity-query
      schema="decision"
      where="source=current"
      sort="created desc"
      empty-message="No decisions"
    ></entity-query>
  </section>
  <section class="meeting-questions">
    <h2>Open Questions</h2>
    <entity-query
      schema="open-question"
      where="source=current"
      sort="created desc"
      empty-message="No open questions"
    ></entity-query>
  </section>
  <section class="meeting-notes">
    <h2>Related Notes</h2>
    <entity-related-notes></entity-related-notes>
  </section>
</entity-page>
```

### Summary Template (used when meeting appears as a query result or related item)

```html
<div class="meeting-summary">
  <a class="meeting-summary__title"><entity-title></entity-title></a>
  <span class="meeting-summary__date"><entity-field name="start"></entity-field></span>
</div>
```

### Picker Template

```html
<span class="meeting-picker">
  <entity-title></entity-title>
  <small><entity-field name="start"></entity-field></small>
</span>
```

### Acceptance Criteria

- A meeting entity page shows: title (editable), start/end times, attendees list, agenda (Markdown), quick capture box, next actions list, decisions list, open questions list, related notes.
- Quick capture on the meeting page creates a captured-note with `source: [[Meeting Title]]`.
- Next actions created from this meeting appear in the "Next Actions" section.
- Captured notes referencing this meeting appear in "Related Notes".
- All sections show empty-state messages when no items exist.
