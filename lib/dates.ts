export function startOfWeek(date = new Date()) {
  const day = date.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day; // move back to Monday
  const monday = new Date(date);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() + diff);
  return monday;
}

export function toISODate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

const DAY_LABELS = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];

export function weekDays(weekStartISO: string) {
  const monday = new Date(`${weekStartISO}T00:00:00`);
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    return { label: DAY_LABELS[i], date: toISODate(date), dayNumber: date.getDate() };
  });
}

export function formatWeekRange(weekStartISO: string) {
  const monday = new Date(`${weekStartISO}T00:00:00`);
  const sunday = addDays(monday, 6);
  const fmt = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long" });
  return `${fmt.format(monday)} – ${fmt.format(sunday)}`;
}

export function todayISO() {
  return toISODate(new Date());
}
