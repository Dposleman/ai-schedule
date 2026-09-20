/** Calendar helpers for monthly payroll windows. Dates are date-only ISO
 * values, deliberately avoiding browser/server timezone timestamps. */
function iso(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
function daysInMonth(year: number, month: number) { return new Date(Date.UTC(year, month + 1, 0)).getUTCDate(); }
function clampDay(year: number, month: number, day: number) { return Math.min(day, daysInMonth(year, month)); }

export function payPeriodFor(date: string, configuredStartDay: number) {
  const startDay = Math.max(1, Math.min(28, configuredStartDay || 1));
  const [year, month, day] = date.split("-").map(Number);
  const startsThisMonth = day >= clampDay(year, month - 1, startDay);
  const startMonth = startsThisMonth ? month - 1 : month - 2;
  const startYear = startMonth < 0 ? year - 1 : year;
  const normalizedStartMonth = (startMonth + 12) % 12;
  const endMonth = normalizedStartMonth + 1;
  const endYear = endMonth > 11 ? startYear + 1 : startYear;
  const normalizedEndMonth = endMonth % 12;
  const start = iso(startYear, normalizedStartMonth, clampDay(startYear, normalizedStartMonth, startDay));
  const endDate = new Date(Date.UTC(endYear, normalizedEndMonth, clampDay(endYear, normalizedEndMonth, startDay)));
  endDate.setUTCDate(endDate.getUTCDate() - 1);
  const end = endDate.toISOString().slice(0, 10);
  return { start, end, startDay };
}
