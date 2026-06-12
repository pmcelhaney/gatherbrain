# 0015 — `<entity-markdown>` Custom Element

## Summary

As a user, I want an element that safely renders Markdown content so that entity bodies and text properties display with formatting.

## Details

File: `src/elements/entity-markdown.ts`

**Attributes:**
- `field` (optional) — if provided, render the value of `context.entity.frontmatter[field]` as Markdown. If absent, render `context.entity.body`.

**Behavior:**

- Extends `BaseElement`.
- Use a lightweight Markdown parser to convert Markdown to HTML. Recommended: **marked** (small, fast) or **micromark**.
- **Wikilink processing:** Before rendering, transform wikilink syntax `[[Title]]` into clickable links:
  - For each `[[Title]]` occurrence, look up the entity via `context.store.findByTitle(title)`.
  - If found, replace with `<a href="#/entity/{id}" data-entity-id="{id}">{title}</a>`.
  - If not found, render as `<span class="broken-link">[[{title}]]</span>`.
- **Security:** Sanitize the rendered HTML output to prevent XSS. Use the **DOMPurify** library or equivalent. Do not allow `<script>` tags or event handler attributes in rendered Markdown.
- Render the sanitized HTML into a shadow DOM or into a scoped `<div class="entity-markdown">` container.

**HTML usage:**
```html
<entity-markdown></entity-markdown>
<entity-markdown field="agenda"></entity-markdown>
```

### Wikilink Example

Input body:
```
Send [[John Smith]] the [[Tech Assembly]] agenda.
```

Rendered HTML:
```html
<p>Send <a href="#/entity/person_John_Smith" data-entity-id="person_John_Smith">John Smith</a> the <a href="#/entity/topic_tech_assembly" data-entity-id="topic_tech_assembly">Tech Assembly</a> agenda.</p>
```

### Acceptance Criteria

- Markdown headings, lists, bold, italic, code blocks render correctly.
- `[[Known Entity]]` renders as a clickable link that navigates to the entity.
- `[[Unknown Entity]]` renders as a broken-link span.
- No `<script>` or `onerror` attributes survive in the output (XSS sanitization is active).
- The `field` attribute switches from body to the named frontmatter field.
- Empty body or field renders empty without errors.
