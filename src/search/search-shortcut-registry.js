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
    current: () => '(type:todo OR type:"in progress" OR type:waiting) AND due<=today',
    overdue: () => "due<today",
    today: () => "due:today",
    session: ({ currentSession }) => {
      if (!currentSession) {
        throw new Error("Current session is required for //session");
      }

      return `session:"${currentSession.name ?? currentSession}"`;
    }
  };
}
