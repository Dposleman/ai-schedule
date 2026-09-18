import type { Lang } from "@/lib/i18n";
import { LOCALE } from "@/lib/i18n";

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

const DAY_LABELS: Record<Lang, string[]> = {
  en: ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"],
  da: ["MAN", "TIR", "ONS", "TOR", "FRE", "LØR", "SØN"],
};

export function weekDays(weekStartISO: string, lang: Lang = "en") {
  const monday = new Date(`${weekStartISO}T00:00:00`);
  const labels = DAY_LABELS[lang] ?? DAY_LABELS.en;
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    return { label: labels[i], date: toISODate(date), dayNumber: date.getDate() };
  });
}

export function formatWeekRange(weekStartISO: string, lang: Lang = "en") {
  const monday = new Date(`${weekStartISO}T00:00:00`);
  const sunday = addDays(monday, 6);
  const fmt = new Intl.DateTimeFormat(LOCALE[lang] ?? LOCALE.en, { day: "numeric", month: "long" });
  return `${fmt.format(monday)} – ${fmt.format(sunday)}`;
}

export function todayISO() {
  return toISODate(new Date());
}
