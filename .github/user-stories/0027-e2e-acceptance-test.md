# 0027 — End-to-End Acceptance Test: Full Capture Flow

## Summary

As a developer, I want an end-to-end test that validates the complete quick capture scenario from the product specification so that regressions are caught automatically.

## Details

Implement an automated end-to-end test using **Playwright** (or equivalent browser automation tool).

### Scenario (from spec section 19)

**Setup:**
- Create a temporary vault directory with:
  - `Entities/Meetings/EA Core Weekly/EA Core Weekly.md`
  - `Entities/People/John Smith.md` (with alias `John`)
  - `Entities/Topics/Tech Assembly.md`

**Test steps:**
1. Open the app in the browser.
2. Open the temporary vault.
3. Navigate to the EA Core Weekly entity page (`#/entity/meeting_ea_core_weekly`).
4. Find the `<quick-capture>` element.
5. Type: `Send John the Tech Assembly agenda`
6. Press `Enter`.

**Assertions:**
1. A new Markdown file is created in the vault with a path matching `Entities/Meetings/EA Core Weekly/YYYY-MM-DD-*-send-john-the-tech-assembly-agenda.md`.
2. The created file's frontmatter contains:
   - `schema: captured-note`
   - `source` contains `[[EA Core Weekly]]`
   - `references` contains `[[John Smith]]`
   - `references` contains `[[Tech Assembly]]`
3. The created file's body contains `[[John Smith]]` and `[[Tech Assembly]]` as wikilinks.
4. The EA Core Weekly page shows the new note in its related notes section.
5. Navigating to John Smith's page shows the same note in related notes.
6. Navigating to Tech Assembly's page shows the same note in related notes.

**Second scenario: inline status edit**

1. Given a next action entity exists with `status: open` and `source: [[EA Core Weekly]]`.
2. Navigate to EA Core Weekly page.
3. Find the next action in the "Next Actions" section.
4. Change the status dropdown to "done".
5. Assert the Markdown file's frontmatter now has `status: done`.

### Test Infrastructure Requirements

- Add Playwright as a dev dependency.
- Add an `e2e/` directory for test files.
- Add a `test:e2e` npm script.
- The test should use the File System Access API mock or a test-specific file system adapter to avoid requiring a real browser file picker.
  - Implement a `FileSystemAdapter` interface with `readFile`, `writeFile`, `listFiles`, `createDirectory` methods.
  - In tests, use an in-memory adapter.
  - In production, use the real File System Access API adapter.

### Acceptance Criteria

- `npm run test:e2e` passes all scenarios.
- Tests run in CI (headless Chromium).
- The file system adapter interface makes unit testing of file-dependent logic possible without browser APIs.
