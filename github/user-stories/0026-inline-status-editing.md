# 0026 — Inline Status Editing for Next Actions

## Summary

As a user, I want to change the status of a next action directly from the meeting page without opening the next action's full page so that I can quickly mark work done.

## Details

This story ensures that the `<entity-select>` element used inside a `summaryTemplate` correctly updates the underlying entity file, not the current entity.

### Context-Switching in Summary Templates

When `<entity-query>` renders a result entity's `summaryTemplate` (story 0016), it must inject a context where `entity` is the **result entity**, not the page entity. This was specified in story 0016 but this story validates the end-to-end behavior for the next-action status use case.

### Verification

The next action summary template is:

```html
<div class="action-summary">
  <entity-title></entity-title>
  <entity-select name="status"></entity-select>
</div>
```

When rendered inside a meeting page's `<entity-query schema="next-action" where="source=current">`:

- `<entity-title>` shows the next action's title (not the meeting's).
- `<entity-select name="status">` shows the next action's current status.
- Changing the select updates the **next action file** (not the meeting file).

### Requirements

- Confirm that `context.entity` inside a `summaryTemplate` render refers to the result entity.
- Confirm that `context.updateEntity(id, patch)` called from within a result element updates the result entity's file.
- After the status change:
  - The dropdown immediately reflects the new value.
  - The next action's Markdown frontmatter on disk is updated.
  - If the query has `where="status=open"`, the item disappears from the list once status changes to "done".

### Acceptance Criteria (mirrors spec section 19)

Given a next action "Send John the Tech Assembly agenda" with `status: open` appears on the EA Core Weekly page.

When the user changes the status dropdown from "open" to "done":

- The next action's Markdown file frontmatter is updated to `status: done`.
- The UI reflects "done" in the dropdown.
- If the meeting page query filters on `status=open`, the action is removed from the list.

### Implementation Note

No new custom elements are required. This story is satisfied by correctly implementing the context-switching logic in `<entity-query>` (story 0016) and verifying it works end-to-end with `<entity-select>` (story 0013).

Write an integration test (or E2E test if E2E testing is set up) that validates this flow.
