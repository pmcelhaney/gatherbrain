import { TimeBox } from "../domain/index.js";

export class TimeBoxTextCodec {
  serialize(date, timeBoxes) {
    const lines = [...timeBoxes]
      .sort((left, right) => left.startsAt.localeCompare(right.startsAt))
      .map((timeBox) => {
        if (timeBox.date !== date) {
          throw new Error("Cannot serialize time boxes from different dates");
        }

        return `${timeBox.startsAt}-${timeBox.endsAt} | ${timeBox.session.name} | ${timeBox.id}`;
      });

    return lines.length > 0 ? `${lines.join("\n")}\n` : "";
  }

  parse(date, text) {
    if (!text.trim()) {
      return [];
    }

    return text
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .map((line) => parseLine(date, line));
  }
}

function parseLine(date, line) {
  const [range, session, id] = line.split("|").map((part) => part.trim());

  if (!range || !session || !id) {
    throw new Error(`Invalid time box line: ${line}`);
  }

  const [startsAt, endsAt] = range.split("-").map((part) => part.trim());

  return new TimeBox({
    id,
    date,
    startsAt,
    endsAt,
    session
  });
}
