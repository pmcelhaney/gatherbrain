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
- `emptyAction`: optional app behavior to execute when the command is entered with no arguments.
- `arguments`: ordered argument definitions.

## Actions

Supported actions:

- `switch_context`: change the current context. Requires `context`.
- `change_peek`: peek at a context. Requires `context`.
- `clear_peek`: clear peek. Takes no arguments.
- `switch_lens`: change lens. Requires `lens`.
- `create_fact`: create a fact in the current context. Requires `title`.
- `edit_fact`: open a fact in `$EDITOR`. Requires `item`.
- `open_reference`: open the current context directory or a fact's referenced `file`. Accepts optional `item`.
- `delete_fact`: move a fact to `.trash`. Requires `item`.
- `relate_fact`: add a related context to a fact. Requires `item` and `context`.
- `move_fact`: move a fact to another context and relate it to the source context. Requires `item` and `context`.
- `set_fact_type`: change a fact type. Requires `type` and `item`.
- `set_fact_property`: change a front matter property on a fact. Requires `item` and `value`, plus either command-level `property` or a `property` argument.
- `paste_clipboard`: save clipboard contents to a file and create a fact pointing to it. Requires `title`; the built-in command supplies a timestamped default when it prompts.
- `show_plan`: render the current day's planner view. Usually used as `emptyAction` for a planner command.
- `plan_timebox`: append a planner timebox row. Requires `range` and `context`.
- `cancel_timebox`: cancel a stored planner timebox row. Requires `range` and `context`.
- `switch_to_current_timebox`: switch to the context that owns the present time. Takes no arguments.
- `restart_app`: restart the app process and restore stable UI state. Takes no arguments.

## Argument Types

Supported argument types:

- `context`: a workspace context path. Supports completion.
- `fact`: a fact from the current visible list. Numbered facts still work, and completion matches visible fact titles.
- `lens`: a lens id. Supports completion.
- `enum`: a string value from `.gatherbrain/enums.json`. Supports completion.
- `factType`: a type string starting with a letter and containing only letters, numbers, spaces, `_`, or `-`. If `enum` is set, those enum values are offered as completions.
- `date`: a natural language date normalized to `YYYY-MM-DD`.
- `timeRange`: a planner time or range such as `9`, `9-12`, or `1:30-3`, normalized to `HH:MM` start and end values.
- `text`: free text.

Argument fields:

- `name`: value name used by the action.
- `type`: one of the supported argument types.
- `enum`: required when `type` is `enum`; optional when `type` is `factType`. Names the configured enum to use for values or completions.
- `prompt`: text shown when the user omits this argument.
- `consume`: optional. Use `"rest"` when the argument may contain spaces or slashes and should consume the rest of the command line.

Date arguments understand:

- `today`, `tomorrow`, and `yesterday`
- `in 2 days` and `in 2 weeks`
- weekdays such as `friday` and `next monday`
- `YYYY-MM-DD`
- `M/D/YYYY` and `M/D/YY`

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

This adds `:mark todo 3`.

For `fact` arguments, completion lets the user search by title. For example, if a visible fact is titled `Call Steve`, typing `:edit Call` and pressing `Tab` completes the argument to `Call Steve`. Commands still accept visible item numbers such as `:edit 3`.

Create facts through a named command:

```json
{
  "commands": [
    {
      "name": "capture",
      "action": "create_fact",
      "arguments": [
        {
          "name": "title",
          "type": "text",
          "consume": "rest",
          "prompt": "Capture what?"
        }
      ]
    }
  ]
}
```

This adds `:capture Follow up with Alex`.

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

Add a command that sets a date property:

```json
{
  "commands": [
    {
      "name": "deadline",
      "action": "set_fact_property",
      "property": "due",
      "arguments": [
        {
          "name": "value",
          "type": "date",
          "prompt": "Due when?"
        },
        {
          "name": "item",
          "type": "fact",
          "prompt": "Set due date on which fact?"
        }
      ]
    }
  ]
}
```

This adds commands such as `:deadline today 3`, using the argument order defined above, which writes `due: 2026-06-24`.

Add an alias for moving facts:

```json
{
  "commands": [
    {
      "name": "mv",
      "action": "move_fact",
      "arguments": [
        {
          "name": "item",
          "type": "fact",
          "prompt": "Move which fact?"
        },
        {
          "name": "context",
          "type": "context",
          "consume": "rest",
          "prompt": "Move it where?"
        }
      ]
    }
  ]
}
```

This adds `:mv 3 /projects/gatherbrain` without removing `:move`.
