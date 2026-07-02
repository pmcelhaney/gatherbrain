export class Context {
  constructor(name) {
    const normalizedName = Context.normalizeName(name);

    if (!normalizedName) {
      throw new Error("Context name is required");
    }

    this.name = normalizedName;
    this.canonicalName = Context.canonicalize(normalizedName);
  }

  static normalizeName(name) {
    if (typeof name !== "string") {
      throw new TypeError("Context name must be a string");
    }

    return name
      .replace(/\\(\s)/g, "$1")
      .trim()
      .replace(/\s+/g, " ")
      .replace(/\s*\/\s*/g, "/")
      .replace(/\/+/g, "/")
      .replace(/^\/|\/$/g, "");
  }

  static canonicalize(name) {
    return Context.normalizeName(name).toLocaleLowerCase("en-US");
  }

  equals(other) {
    const otherContext = Context.from(other);
    return this.canonicalName === otherContext.canonicalName;
  }

  pathSegment() {
    return this.pathSegments().join("/");
  }

  pathSegments() {
    return this.name
      .split("/")
      .map((segment) => segment
        .replace(/[:\\\0-\x1F\x7F]/g, "-")
        .replace(/\s+/g, " ")
        .trim())
      .filter(Boolean)
      .map((segment) => segment === "." || segment === ".." ? "-" : segment);
  }

  toString() {
    return this.name;
  }

  toJSON() {
    return this.name;
  }

  static from(value) {
    if (value instanceof Context) {
      return value;
    }

    return new Context(value);
  }
}
