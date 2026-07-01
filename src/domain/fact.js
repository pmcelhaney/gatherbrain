import { Session } from "./session.js";
import { normalizeTags } from "./tags.js";

export class Fact {
  constructor({
    id,
    content,
    type,
    createdAt,
    dueDate = null,
    file = null,
    homeSession,
    associatedSessions = [],
    tags = []
  }) {
    if (typeof content !== "string" || content.trim().length === 0) {
      throw new Error("Fact content is required");
    }

    this.id = normalizeUuid(id);
    this.content = content;
    this.type = normalizeType(type);
    this.createdAt = normalizeTimestamp(createdAt, "createdAt");
    this.homeSession = normalizeHomeSession(homeSession);
    this.associatedSessions = [];
    this.dueDate = normalizeDate(dueDate);
    this.file = normalizeFile(file);
    this.tags = normalizeTags(tags);

    for (const session of associatedSessions) {
      this.associateSession(session);
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

  addTag(tag) {
    this.tags = normalizeTags([...this.tags, tag]);
  }

  associateSession(session) {
    const nextSession = Session.from(session);

    if (this.homeSession.equals(nextSession)) {
      return;
    }

    if (this.associatedSessions.some((existing) => existing.equals(nextSession))) {
      return;
    }

    this.associatedSessions.push(nextSession);
  }

  dissociateSession(session) {
    const target = Session.from(session);
    this.associatedSessions = this.associatedSessions.filter(
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
      homeSession: this.homeSession.name,
      associatedSessions: this.associatedSessions.map((session) => session.name),
      tags: this.tags
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

function normalizeHomeSession(homeSession) {
  if (homeSession === null || homeSession === undefined) {
    throw new Error("Fact home session is required");
  }

  return Session.from(homeSession);
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
