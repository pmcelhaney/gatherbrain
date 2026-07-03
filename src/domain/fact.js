import { Context } from "./context.js";

export class Fact {
  constructor({
    id,
    content,
    type,
    createdAt,
    dueDate = null,
    file = null,
    url = null,
    homeContext,
    associatedContexts = []
  }) {
    if (typeof content !== "string" || content.trim().length === 0) {
      throw new Error("Fact content is required");
    }

    this.id = normalizeUuid(id);
    this.content = content;
    this.type = normalizeType(type);
    this.createdAt = normalizeTimestamp(createdAt, "createdAt");
    this.homeContext = normalizeHomeContext(homeContext);
    this.associatedContexts = [];
    this.dueDate = normalizeDate(dueDate);
    this.file = normalizeFile(file);
    this.url = normalizeUrl(url);

    for (const context of associatedContexts) {
      this.associateContext(context);
    }
  }

  setType(type) {
    this.type = normalizeType(type);
  }

  setDueDate(dueDate) {
    this.dueDate = normalizeDate(dueDate);
  }

  clearDueDate() {
    this.dueDate = null;
  }

  associateContext(context) {
    const nextContext = Context.from(context);

    if (this.homeContext.equals(nextContext)) {
      return;
    }

    if (this.associatedContexts.some((existing) => existing.equals(nextContext))) {
      return;
    }

    this.associatedContexts.push(nextContext);
  }

  dissociateContext(context) {
    const target = Context.from(context);
    this.associatedContexts = this.associatedContexts.filter(
      (existing) => !existing.equals(target)
    );
  }

  toSerializable() {
    return {
      id: this.id,
      content: this.content,
      type: this.type,
      createdAt: this.createdAt.toISOString(),
      dueDate: this.dueDate,
      file: this.file,
      url: this.url,
      homeContext: this.homeContext.name,
      associatedContexts: this.associatedContexts.map((context) => context.name)
    };
  }

  static from(value) {
    if (value instanceof Fact) {
      return value;
    }

    return new Fact(value);
  }
}

function normalizeUuid(id) {
  if (typeof id !== "string" || id.trim().length === 0) {
    throw new Error("Fact id is required");
  }

  const normalizedId = id.trim().toLowerCase();

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      normalizedId
    )
  ) {
    throw new Error("Fact id must be a UUID");
  }

  return normalizedId;
}

function normalizeHomeContext(homeContext) {
  if (homeContext === null || homeContext === undefined) {
    throw new Error("Fact home context is required");
  }

  return Context.from(homeContext);
}

function normalizeType(type) {
  if (typeof type !== "string" || type.trim().length === 0) {
    throw new Error("Fact type is required");
  }

  return type.trim();
}

function normalizeTimestamp(value, fieldName) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} must be a valid timestamp`);
  }

  return date;
}

function normalizeDate(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Due date must use YYYY-MM-DD format");
  }

  return value;
}

function normalizeFile(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("Fact file must be a string");
  }

  return value.trim();
}

function normalizeUrl(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("Fact URL must be a string");
  }

  const normalized = value.trim();

  try {
    const url = new URL(normalized);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("unsupported protocol");
    }
  } catch {
    throw new Error("Fact URL must be an HTTP or HTTPS URL");
  }

  return normalized;
}
