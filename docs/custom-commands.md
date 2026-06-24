# Custom Commands

Commands are configured with JSON. The default command set lives at `default-config/commands.json`.

To customize commands for a workspace, create this file inside the workspace root:

```text
.gatherbrain/commands.json
```

The app loads default commands first, then loads workspace commands. A workspace command with the same `name` as a default command replaces that default. A workspace command with a new `name` is appended.

## File Format

```json
{
  "commands": [
    {
      "name": "jump",
      "action": "switch_context",
      "arguments": [
        {
          "name": "context",
          "type": "context",
          "consume": "rest",
          "prompt": "Jump where?"
        }
      ]
    }
  ]
}
```

Each command has:

- `name`: the colon command name, without `:`.
- `action`: the app behavior to execute.
- `arguments`: ordered argument definitions.

## Actions

Supported actions:

- `switch_context`: change the current context. Requires `context`.
- `change_gaze`: gaze at a context. Requires `context`.
- `clear_gaze`: clear gaze. Takes no arguments.
- `switch_lens`: change lens. Requires `lens`.
- `edit_fact`: open a fact in `$EDITOR`. Requires `item`.
- `delete_fact`: move a fact to `.trash`. Requires `item`.
- `relate_fact`: add a related context to a fact. Requires `item` and `context`.
- `set_fact_type`: change a fact type. Requires `type` and `item`.

## Argument Types

Supported argument types:

- `context`: a workspace context path. Supports completion.
- `fact`: a numbered fact from the current visible list.
- `lens`: a lens id. Supports completion.
- `enum`: a string value from `.gatherbrain/enums.json`. Supports completion.
- `factType`: a type string starting with a letter and containing only letters, numbers, `_`, or `-`. If `enum` is set, those enum values are offered as completions.

Argument fields:

- `name`: value name used by the action.
- `type`: one of the supported argument types.
- `enum`: required when `type` is `enum`; optional when `type` is `factType`. Names the configured enum to use for values or completions.
- `prompt`: text shown when the user omits this argument.
- `consume`: optional. Use `"rest"` when the argument may contain spaces or slashes and should consume the rest of the command line.

## Examples

Add an alias for switching context:

```json
{
  "commands": [
    {
      "name": "jump",
      "action": "switch_context",
      "arguments": [
        {
          "name": "context",
          "type": "context",
          "consume": "rest",
          "prompt": "Jump where?"
        }
      ]
    }
  ]
}
```

Override the default `:switch` prompt:

```json
{
  "commands": [
    {
      "name": "switch",
      "action": "switch_context",
      "arguments": [
        {
          "name": "context",
          "type": "context",
          "consume": "rest",
          "prompt": "Switch workspace context to?"
        }
      ]
    }
  ]
}
```

Add a shorter command for setting type:

```json
{
  "commands": [
    {
      "name": "mark",
      "action": "set_fact_type",
      "arguments": [
        {
          "name": "type",
          "type": "factType",
          "enum": "factType",
          "prompt": "Set which type?"
        },
        {
          "name": "item",
          "type": "fact",
          "prompt": "Mark which fact?"
        }
      ]
    }
  ]
}
```

This adds `:mark todo 3` without removing `:type`.

Use an enum argument when the command should only accept configured values:

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

The `status` enum values come from `.gatherbrain/enums.json`. See [Custom Enums](custom-enums.md).
