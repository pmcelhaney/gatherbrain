import { Context } from "./context.js";

export class TimeBox {
  constructor({ id, date, context, startsAt, endsAt }) {
    if (!id) {
      throw new Error("TimeBox id is required");
    }

    this.id = String(id);
    this.date = normalizeDate(date);
    this.context = Context.from(context);
    this.startsAt = normalizeTime(startsAt, "startsAt");
    this.endsAt = normalizeTime(endsAt, "endsAt");

    if (timeToMinutes(this.endsAt) <= timeToMinutes(this.startsAt)) {
      throw new Error("TimeBox end time must be after start time");
    }
  }

  containsTime(time) {
    const minutes = timeToMinutes(normalizeTime(time, "time"));
    return minutes >= this.startMinute && minutes < this.endMinute;
  }

  overlaps(other) {
    const otherTimeBox = TimeBox.from(other);

    if (this.date !== otherTimeBox.date) {
      return false;
    }

    return this.startMinute < otherTimeBox.endMinute &&
      otherTimeBox.startMinute < this.endMinute;
  }

  get startMinute() {
    return timeToMinutes(this.startsAt);
  }

  get endMinute() {
    return timeToMinutes(this.endsAt);
  }

  toSerializable() {
    return {
      id: this.id,
      date: this.date,
      context: this.context.name,
      startsAt: this.startsAt,
      endsAt: this.endsAt
    };
  }

  static from(value) {
    if (value instanceof TimeBox) {
      return value;
    }

    return new TimeBox(value);
  }
}

function normalizeDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("TimeBox date must use YYYY-MM-DD format");
  }

  return value;
}

function normalizeTime(value, fieldName) {
  if (typeof value !== "string") {
    throw new Error(`${fieldName} must use HH:MM format`);
  }

  const match = value.match(/^(\d{1,2}):(\d{2})$/);

  if (!match) {
    throw new Error(`${fieldName} must use HH:MM format`);
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error(`${fieldName} must be a valid local time`);
  }

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function timeToMinutes(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}
