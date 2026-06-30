export class CalendarRenderer {
  render({ timeBoxes = [], planPreview = null, height = 20 } = {}) {
    const rows = [...timeBoxes]
      .sort((left, right) => left.startsAt.localeCompare(right.startsAt))
      .map((timeBox) => renderTimeBox(timeBox));

    if (planPreview?.timeBox) {
      rows.push(`? ${renderTimeBox(planPreview.timeBox)}`);
    } else if (planPreview?.error) {
      rows.push(`! ${planPreview.error}`);
    }

    const visibleRows = rows.length > 0 ? rows : ["(no time boxes)"];
    return visibleRows.slice(-height);
  }
}

function renderTimeBox(timeBox) {
  return `${timeBox.startsAt}-${timeBox.endsAt} ${timeBox.session.name}`;
}
