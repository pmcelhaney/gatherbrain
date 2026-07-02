export class SearchShortcutRegistry {
  constructor(shortcuts = defaultShortcuts()) {
    this.shortcuts = new Map(Object.entries(shortcuts));
  }

  expand(rawQuery, context = {}) {
    if (typeof rawQuery !== "string") {
      throw new Error("Search query is required");
    }

    const query = rawQuery.trim();

    if (!query.startsWith("//")) {
      return query;
    }

    const shortcutName = query.slice(2).trim();
    const shortcut = this.shortcuts.get(shortcutName);

    if (!shortcut) {
      throw new Error(`Unknown search shortcut: ${shortcutName}`);
    }

    return typeof shortcut === "function" ? shortcut(context) : shortcut;
  }

  names() {
    return [...this.shortcuts.keys()].sort();
  }
}

function defaultShortcuts() {
  return {
    current: () => "(type:task OR type:inprogress OR type:waiting) AND due<=today",
    overdue: () => "due<today",
    today: () => "due:today",
    context: ({ currentContext }) => {
      if (!currentContext) {
        throw new Error("Current context is required for //context");
      }

      return `context:"${currentContext.name ?? currentContext}"`;
    }
  };
}
