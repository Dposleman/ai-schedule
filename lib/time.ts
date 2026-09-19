// Small shared time-range helpers used anywhere two HH:MM shift blocks need
// to be checked against each other (auto-scheduler, coverage invites/accept,
// attendance). Kept in one place so "what counts as overlapping" is defined
// once.

export function timeToMinutes(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return timeToMinutes(aStart) < timeToMinutes(bEnd) && timeToMinutes(bStart) < timeToMinutes(aEnd);
}
