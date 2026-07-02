import { TimeBox } from "../domain/index.js";
import { naturalDatePrefix } from "../domain/date-text.js";
import { PlanPreview } from "../state/index.js";

export class PlanParser {
  constructor({ today, idGenerator = defaultTimeBoxId } = {}) {
    this.today = today;
    this.idGenerator = idGenerator;
  }

  parse(input, parseContext = {}) {
    try {
      return PlanPreview.valid(this.parseTimeBox(input, parseContext), input);
    } catch (error) {
      return PlanPreview.invalid(input, error);
    }
  }

  parseTimeBox(input, parseContext = {}) {
    const text = normalizePlanInput(input);
    const parts = text.split(/\s+/);
    const today = parseContext.today ?? this.today;

    if (!today) {
      throw new Error("Today is required to parse plan input");
    }

    let date = today;
    let rangeToken = parts.shift();
    const prefixedDate = naturalDatePrefix(text, { today });

    if (prefixedDate) {
      date = prefixedDate.date;
      parts.splice(0, prefixedDate.text.trim().split(/\s+/).length - 1);
      rangeToken = parts.shift();
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(rangeToken)) {
      date = rangeToken;
      rangeToken = parts.shift();
    }

    if (!rangeToken) {
      throw new Error("Plan input requires a time range");
    }

    const [startsAt, endsAt] = parseRange(rangeToken);
    const context = parts.join(" ").trim();

    if (!context) {
      throw new Error("Plan input requires a context");
    }

    return new TimeBox({
      id: this.idGenerator({ date, startsAt, endsAt, context }),
      date,
      startsAt,
      endsAt,
      context
    });
  }
}

function normalizePlanInput(input) {
  if (typeof input !== "string") {
    throw new Error("Plan input must be a string");
  }

  const text = input.trim().replace(/^;/, "").trim();

  if (!text) {
    throw new Error("Plan input is required");
  }

  return text;
}

function parseRange(rangeToken) {
  const match = rangeToken.match(/^(\d{1,2})(?::(\d{2}))?-(\d{1,2})(?::(\d{2}))?$/);

  if (!match) {
    throw new Error("Plan time range must look like 9-10 or 09:30-10:00");
  }

  return [
    normalizeTime(match[1], match[2] ?? "00"),
    normalizeTime(match[3], match[4] ?? "00")
  ];
}

function normalizeTime(hoursValue, minutesValue) {
  const hours = Number(hoursValue);
  const minutes = Number(minutesValue);

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error("Plan time range contains an invalid local time");
  }

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function defaultTimeBoxId({ date, startsAt, endsAt, context }) {
  const slug = context
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${date}-${startsAt.replace(":", "")}-${endsAt.replace(":", "")}-${slug}`;
}
