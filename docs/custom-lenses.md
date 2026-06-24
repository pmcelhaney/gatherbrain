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
      "filter": {
        "enum": "taskTypes"
      }
    }
  ]
}
```

Each lens has:

- `id`: the value used by `:lens`.
- `presenter`: the built-in presenter function to use.
- `filter`: optional presenter configuration.

## Presenters

Supported presenters:

- `context_facts`: presents facts visible from the active context or gaze context. It includes facts inside that context and facts related to that context.

## Filters

The `context_facts` presenter supports:

- `filter.enum`: only include facts whose front matter `type` is one of the values in the named enum.
- `filter.types`: only include facts whose front matter `type` is one of these strings.

If no filter is set, the lens shows all visible facts.

## Examples

Add a task-focused lens:

```json
{
  "lenses": [
    {
      "id": "tasks",
      "presenter": "context_facts",
      "filter": {
        "enum": "taskTypes"
      }
    }
  ]
}
```

The `taskTypes` enum values come from `.gatherbrain/enums.json`. See [Custom Enums](custom-enums.md).

Override the default `todo` lens:

```json
{
  "lenses": [
    {
      "id": "todo",
      "presenter": "context_facts",
      "filter": {
        "enum": "todoFactTypes"
      }
    }
  ]
}
```
