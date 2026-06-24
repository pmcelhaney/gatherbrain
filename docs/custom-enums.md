# Custom Enums

Enums are configured with JSON. They define reusable string value lists for command arguments.

To customize enums for a workspace, create this file inside the workspace root:

```text
.gatherbrain/enums.json
```

The app loads default enums first, then loads workspace enums. A workspace enum with the same name as a default enum replaces that default. A workspace enum with a new name is appended.

Default enums are defined in `default-config/enums.json`.

## File Format

```json
{
  "enums": {
    "status": {
      "values": ["todo", "waiting", "in progress", "done"]
    }
  }
}
```

Each enum has:

- `values`: allowed string values.

## Command Usage

Command arguments use enums by setting `type` to `enum` and `enum` to the enum name:

```json
{
  "commands": [
    {
      "name": "status",
      "action": "set_fact_type",
      "arguments": [
        {
          "name": "type",
          "type": "enum",
          "enum": "status",
          "prompt": "Set which status?"
        },
        {
          "name": "item",
          "type": "fact",
          "prompt": "Change which fact?"
        }
      ]
    }
  ]
}
```

This allows commands such as `:status todo 3` and rejects values that are not in the enum.
