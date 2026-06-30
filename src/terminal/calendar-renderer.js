export class CalendarRenderer {
  render({ timeBoxes = [], planPreview = null } = {}) {
    const rows = [...timeBoxes]
      .sort((left, right) => left.startsAt.localeCompare(right.startsAt))
      .map((timeBox) => renderTimeBox(timeBox));

    if (planPreview?.timeBox) {
      rows.push(`? ${renderTimeBox(planPreview.timeBox)}`);
    } else if (planPreview?.error) {
      rows.push(`! ${planPreview.error}`);
    }

    return rows.length > 0 ? rows.join("\n") : "(no time boxes)";
  }
}

function renderTimeBox(timeBox) {
  return `${timeBox.startsAt}-${timeBox.endsAt} ${timeBox.session.name}`;
}
