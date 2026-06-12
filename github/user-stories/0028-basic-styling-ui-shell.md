# 0028 — Basic Styling and UI Shell

## Summary

As a user, I want the app to have a clean, functional visual design so that it is easy to read and use.

## Details

Add base CSS styles to make the app look like a functional tool rather than an unstyled prototype. The goal is utility and readability, not polish.

### Design Principles

- The UI should feel more like an IDE than a consumer app.
- Use a neutral, dark or light color palette (user's choice via prefers-color-scheme).
- Use a monospace or semi-monospace font for entity titles to reinforce the "structured data" feel.
- Avoid heavy frameworks — use plain CSS variables and scoped styles.

### Required Styles

**App shell:**
- Centered main content area (max-width: ~800px) on wide screens.
- A minimal top bar showing: vault name, back button (when applicable).
- Comfortable line spacing and font size for readability.

**Entity page sections:**
- Clear visual separation between sections (`<section>` elements).
- Section headings (`<h2>`) styled subtly (smaller than page title, muted color).

**Quick capture:**
- The `<quick-capture>` input should be visually prominent — full width, large enough to invite typing.
- Clear focus ring.

**Entity query results:**
- List items have subtle separators.
- Hover state on list items.

**Status select (`<entity-select>`):**
- Status chips styled by value:
  - `open` → blue
  - `waiting` → yellow/amber
  - `done` → green
  - `canceled` → gray strikethrough
  - `proposed` → blue
  - `accepted` → green
  - `rejected` → red
  - `answered` → green
  - `closed` → gray

**Links:**
- Entity links (wikilinks rendered as `<a>`) styled distinctly from regular links.
- Broken links styled with muted color and `[[...]]` brackets visible.

### Implementation Notes

- Create `src/styles/main.css` for global styles.
- Create `src/styles/components/` for per-component styles.
- Import styles in `src/main.ts` or `index.html`.
- Use CSS custom properties (variables) for colors and spacing so theming is straightforward later.

### Acceptance Criteria

- The app is visually readable and functional on a 1440px desktop screen.
- `prefers-color-scheme: dark` applies a dark theme.
- Status values are color-coded in dropdowns and summary views.
- Quick capture input is visually prominent on entity pages.
- No layout issues on the meeting page with all sections populated.
