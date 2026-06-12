# 0013 — `<entity-field>` and `<entity-select>` Custom Elements

## Summary

As a user, I want elements that display and edit scalar and enum properties from an entity's frontmatter.

## Details

### `<entity-field>`

File: `src/elements/entity-field.ts`

Displays (and optionally edits) a single scalar frontmatter property.

**Attributes:**
- `name` (required) — the frontmatter property key.
- `mode` — `"view"` (default) or `"edit"`.

**Behavior:**
- Extends `BaseElement`.
- In `onContextReady()`, reads the value from `context.entity.frontmatter[name]`.
- In `view` mode: renders a `<span>` with the formatted value.
  - Dates and datetimes should be formatted in a human-readable way (e.g., using `Intl.DateTimeFormat`).
  - Booleans render as "Yes" / "No".
  - Other scalar values render as their string representation.
- In `edit` mode: renders an appropriate `<input>` for the property type (derived from the schema's property definition):
  - `string` → `<input type="text">`
  - `number` → `<input type="number">`
  - `boolean` → `<input type="checkbox">`
  - `date` → `<input type="date">`
  - `datetime` → `<input type="datetime-local">`
  - `text` → `<textarea>`
- On change (blur for text, change for checkbox/select), calls `context.updateEntity(entity.id, { [name]: newValue })`.

**HTML usage:**
```html
<entity-field name="start" mode="edit"></entity-field>
<entity-field name="role"></entity-field>
```

---

### `<entity-select>`

File: `src/elements/entity-select.ts`

Displays and edits an enum frontmatter property as a dropdown.

**Attributes:**
- `name` (required) — the frontmatter property key.

**Behavior:**
- Extends `BaseElement`.
- Reads property definition from `context.schema.properties[name]` to get `options`.
- Renders a `<select>` with one `<option>` per enum value.
- Selected option reflects the current frontmatter value.
- On `change`, calls `context.updateEntity(entity.id, { [name]: selectedValue })`.

**HTML usage:**
```html
<entity-select name="status"></entity-select>
```

---

### Acceptance Criteria

- `<entity-field name="start">` renders the formatted date/time from frontmatter.
- `<entity-field name="start" mode="edit">` renders a datetime input pre-populated with the current value.
- Editing any field and blurring/changing updates the entity file.
- `<entity-select name="status">` shows all enum options with the current value selected.
- Changing the select value updates the frontmatter.
- Both elements render empty gracefully if the property is not found.
