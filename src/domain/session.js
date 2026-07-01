export class Session {
  constructor(name) {
    const normalizedName = Session.normalizeName(name);

    if (!normalizedName) {
      throw new Error("Session name is required");
    }

    this.name = normalizedName;
    this.canonicalName = Session.canonicalize(normalizedName);
  }

  static normalizeName(name) {
    if (typeof name !== "string") {
      throw new TypeError("Session name must be a string");
    }

    return name
      .replace(/\\(\s)/g, "$1")
      .trim()
      .replace(/\s+/g, " ");
  }

  static canonicalize(name) {
    return Session.normalizeName(name).toLocaleLowerCase("en-US");
  }

  equals(other) {
    const otherSession = Session.from(other);
    return this.canonicalName === otherSession.canonicalName;
  }

  pathSegment() {
    return this.name
      .replace(/[/:\\\0-\x1F\x7F]/g, "-")
      .replace(/\s+/g, " ")
      .trim();
  }

  toString() {
    return this.name;
  }

  toJSON() {
    return this.name;
  }

  static from(value) {
    if (value instanceof Session) {
      return value;
    }

    return new Session(value);
  }
}
