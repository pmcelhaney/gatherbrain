# Custom Lenses

Lenses are configured with JSON. The default lens set lives at `default-config/lenses.json`.

To customize lenses for a workspace, create this file inside the workspace root:

```text
.gatherbrain/lenses.json
```

The app loads default lenses first, then loads workspace lenses. A workspace lens with the same `id` as a default lens replaces that default. A workspace lens with a new `id` is appended.

## File Format

```json
{
  "lenses": [
    {
      "id": "tasks",
      "presenter": "context_facts",
      "template": "facts",
      "filter": {
        "types": ["todo", "waiting", "in progress"]
      }
    }
  ]
}
```

Each lens has:

- `id`: the value used by `:lens`.
- `presenter`: the built-in presenter function to use.
- `template`: optional body template name. Defaults to `facts`.
- `filter`: optional presenter configuration.

## Presenters

Supported presenters:

- `context_facts`: presents facts visible from the active context or peek context. It includes facts inside that context and facts related to that context.
- `due_facts`: presents visible facts that have a `due` front matter property and are not `type: done`.
- `today_facts`: presents visible facts with `due` on or before today and are not `type: done`.
- `current_facts`: presents `today_facts`, plus visible `type: done` facts whose file was last modified today.

Presenters return a body view model. The current renderer supports:

- `body.type: "facts"`
- `body.template`: the configured template name, defaulting to `"facts"`
- `body.facts`: the ordered fact list to render

The default body template lives at `default-config/templates/facts.hbs`. Workspace-local templates live in:

```text
.gatherbrain/templates
```

A workspace-local template with the same name as a default template overrides the default. For example, `.gatherbrain/templates/facts.hbs` replaces `default-config/templates/facts.hbs` for that workspace.

Templates are rendered with Handlebars after the app has prepared fact view models for the terminal.

The facts template receives:

- `hasFacts`: whether there are facts to render.
- `emptyText`: text to show when no facts are visible.
- `facts`: the rendered fact rows.
- `includeColor`: whether ANSI color should be emitted.

Each item in `facts` has:

- `number`: the 1-based visible number, already padded for alignment.
- `type`: the fact type label, or an empty string for plain facts.
- `body`: the wrapped fact text, including Markdown links rendered as colored text and any relation suffixes.
- `sourceContext`: the full context id where the fact lives when that is useful to show.
- `sourceContextShort`: the short final path segment of `sourceContext`.

Templates should loop over facts and render fact properties directly:

```hbs
{{#if hasFacts}}{{#each facts}}{{number}}. {{#if type}}{{type | color: "cyan"}} {{/if}}{{body}}{{#unless @last}}
{{/unless}}{{/each}}{{else}}{{emptyText}}{{/if}}
```

The app supports pipe-style filters for simple formatting. For example, `{{type | color: "cyan"}}` colors the fact type when terminal color is enabled. Supported colors are `blue`, `cyan`, and `magenta`.

Template names must start with a letter and may contain only letters, numbers, `_`, and `-`. The `template` field in a lens uses the filename without `.hbs`.

## Filters

The `context_facts` presenter supports:

- `filter.types`: only include facts whose front matter `type` is one of these strings.

If no filter is set, the lens shows all visible facts.

The `due_facts`, `today_facts`, and `current_facts` presenters do not use `filter`. They all start from the same visible facts as `context_facts`.

## Examples

Add a task-focused lens:

```json
{
  "lenses": [
    {
      "id": "tasks",
      "presenter": "context_facts",
      "template": "facts",
      "filter": {
        "types": ["todo", "waiting", "in progress"]
      }
    }
  ]
}
```

Override the default `todo` lens:

```json
{
  "lenses": [
    {
      "id": "todo",
      "presenter": "context_facts",
      "template": "facts",
      "filter": {
        "types": ["todo", "waiting"]
      }
    }
  ]
}
```
