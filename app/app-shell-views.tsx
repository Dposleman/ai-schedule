"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type L from "leaflet";
import { Geolocation } from "@capacitor/geolocation";
import { apiFetch } from "@/lib/api-client";
import { distanceInMeters } from "@/lib/geo";
import {
  AlertTriangle, ArrowLeftRight, ArrowUpRight, Banknote, Bot, Building2, Crown, CalendarDays,
  CalendarX2, Check, CheckCircle2, ClipboardCheck, Clock3, CreditCard, FileCheck2, Fingerprint, History, LockKeyhole,
  Image as ImageIcon, Mail, MapPin, Phone, ReceiptText, Search, Send, ShieldCheck, Sparkles, Store,
  Trash2, Umbrella, UserPlus, UserCheck, UsersRound, WandSparkles, X,
} from "lucide-react";
import { weekDays, formatWeekRange, todayISO, startOfWeek, addDays, toISODate } from "@/lib/dates";
import { useLanguage } from "@/app/language-context";
import { LANGUAGES } from "@/lib/i18n";
import type {
  CurrentUser, LocationT, OrgT, EmployeeT, ShiftT, AbsenceT, TransferT, TaskT,
  CoverageRequestT, PermissionsT, OpenAttendanceT, TodayAttendanceT, AuditEventT, BillingT, TimesheetRowT,
} from "@/lib/view-types";

// Resizes/re-encodes an uploaded image client-side before it goes anywhere
// near the network — logos only need to render small, so there's no reason
// to ship (or store) a multi-megabyte original.
function fileToLogoDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) { reject(new Error("That doesn't look like an image.")); return; }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.onload = () => {
      const img = new window.Image();
      img.onerror = () => reject(new Error("That doesn't look like an image."));
      img.onload = () => {
        const maxDim = 256;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("Image editing isn't supported in this browser.")); return; }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/png"));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

function initials(name: string) {
  return name.split(" ").filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}
function money(cents: number, locale: string) {
  return (cents / 100).toLocaleString(locale, { style: "currency", currency: "DKK", maximumFractionDigits: 0 });
}
function hoursBetween(start: string, end: string) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return (eh * 60 + em - (sh * 60 + sm)) / 60;
}
// ISO timestamp -> the local "YYYY-MM-DDTHH:mm" a <input type="datetime-local">
// needs, and back. Going through the Date object (not string-slicing the ISO
// value) is what makes this reflect the browser's local timezone instead of
// UTC — a manager correcting a 9am clock-in wants to type "09:00" and have
// it mean 9am where they are, not 9am UTC.
function toLocalInputValue(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInputValue(local: string) {
  return new Date(local).toISOString();
}
function absenceLabel(t: (key: string) => string, type: string) {
  return type === "vacation" ? t("absence.vacation") : type === "sick" ? t("absence.sick") : t("absence.unavailable");
}
// Two same-day time ranges overlap when one starts before the other ends,
// in both directions — used to flag double-booking (same employee assigned
// to two shifts, at any location, whose hours collide).
function timeRangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return aStart < bEnd && bStart < aEnd;
}
// All of an employee's OTHER shifts on a given date that overlap the given
// time range — used both to warn when opening an already-assigned shift and
// to flag candidates in the manual-assign picker before a manager commits to
// double-booking someone.
function conflictingShifts(shifts: ShiftT[], employeeId: string, date: string, startTime: string, endTime: string, excludeShiftId?: string) {
  return shifts.filter((s) => s.userId === employeeId && s.date === date && s.id !== excludeShiftId && timeRangesOverlap(startTime, endTime, s.startTime, s.endTime));
}

/* ---------------- Overview ---------------- */
export function MetricCard({ label, value, detail, tone, icon: Icon }: { label: string; value: string; detail: string; tone: string; icon: React.ComponentType<{ size?: number }> }) {
  return (
    <article className="metric-card">
      <div className={`metric-icon ${tone}`}><Icon size={18} /></div>
      <div><p className="eyebrow">{label}</p><div className="metric-value-row"><strong>{value}</strong></div><p className="metric-detail">{detail}</p></div>
    </article>
  );
}

// Attendance clock-in window slack — mirrors CLOCK_IN_WINDOW_MINUTES_BEFORE
// in app/api/attendance/route.ts. Used only to decide when a shift with no
// clock-in yet should be flagged as an exception rather than "upcoming".
const LATE_AFTER_MINUTES = 15;

type TodayStatus = "checked_in" | "checked_out" | "late" | "upcoming";

function todayStaffingStatus(shift: ShiftT, attendanceToday: TodayAttendanceT[]): TodayStatus {
  const att = attendanceToday.find((a) => a.shiftId === shift.id);
  if (att && !att.checkOutAt) return "checked_in";
  if (att && att.checkOutAt) return "checked_out";
  const now = new Date();
  const [sh, sm] = shift.startTime.split(":").map(Number);
  const shiftStart = new Date(now);
  shiftStart.setHours(sh, sm + LATE_AFTER_MINUTES, 0, 0);
  return now > shiftStart ? "late" : "upcoming";
}

export function ResumenView({ employees, shifts, weekStart, weekEnd, location, locations, absences, coverage, attendanceToday, onGoPlanner, onGoAusencias, onGoChat, onGoTimeTracking, onGoCosts }: {
  employees: EmployeeT[]; shifts: ShiftT[]; weekStart: string; weekEnd: string; location: string;
  locations: LocationT[]; absences: AbsenceT[]; coverage: CoverageRequestT[]; attendanceToday: TodayAttendanceT[];
  onGoPlanner: () => void; onGoAusencias: () => void; onGoChat: () => void; onGoTimeTracking: () => void; onGoCosts: () => void;
}) {
  const { t, lang, locale } = useLanguage();
  const weekShifts = shifts.filter((s) => location === "all" || s.locationId === location);
  const assignedHours = weekShifts.filter((s) => s.userId).reduce((sum, s) => sum + hoursBetween(s.startTime, s.endTime), 0);
  const totalShifts = weekShifts.length;
  const coveredShifts = weekShifts.filter((s) => s.userId).length;
  const coveragePct = totalShifts === 0 ? 0 : Math.round((coveredShifts / totalShifts) * 100);
  const scopedEmployees = employees.filter((e) => location === "all" || (e.currentLocationId ?? e.homeLocationId) === location);
  const pendingAbsences = absences.filter((a) => a.status === "pending");
  const openCoverage = coverage.filter((c) => c.status === "open");
  const days = weekDays(weekStart, lang);
  const locationName = location === "all" ? t("allLocations.lower") : locations.find((l) => l.id === location)?.name ?? "";

  // Today's staffing + attendance exceptions (master prompt 11.4: Overview
  // must show today staffing and attendance exceptions, not just the week
  // grid). "Exception" here means a shift whose start time has passed by
  // more than the clock-in slack with no clock-in recorded yet.
  const today = todayISO();
  const todayShifts = weekShifts.filter((s) => s.date === today && s.userId).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const todayRows = todayShifts.map((shift) => ({ shift, employee: employees.find((e) => e.id === shift.userId), status: todayStaffingStatus(shift, attendanceToday) }));
  const exceptionCount = todayRows.filter((r) => r.status === "late").length;

  // Labour/budget signal — reuses the same weekly cost-vs-budget semantics
  // as CostsView (locations.budgetCents is treated as a weekly figure
  // there), just narrowed to today's shifts and presented as an even daily
  // share of that weekly budget so it's comparable. hourlyRateCents is
  // already stripped server-side for non-management roles, and this whole
  // view is management-only (not in the employee nav), so no separate
  // compensation gate is needed here.
  const scopedLocations = locations.filter((l) => location === "all" || l.id === location);
  const weeklyBudgetCents = scopedLocations.reduce((sum, l) => sum + (l.budgetCents ?? 0), 0);
  const dailyBudgetCents = Math.round(weeklyBudgetCents / 7);
  const todayLabourCents = todayShifts.reduce((sum, s) => {
    const emp = employees.find((e) => e.id === s.userId);
    return sum + (emp ? (emp.hourlyRateCents ?? 0) * hoursBetween(s.startTime, s.endTime) : 0);
  }, 0);
  const labourPct = dailyBudgetCents > 0 ? Math.round((todayLabourCents / dailyBudgetCents) * 100) : 0;

  return (
    <>
      <section className="hero-strip">
        <div className="hero-copy">
          <span className="hero-badge"><Sparkles size={13} /> {t("resumen.badge")}</span>
          <h2>{formatWeekRange(weekStart, lang)}</h2>
          <p>{totalShifts > 0 ? t("resumen.coveredOf", { covered: coveredShifts, total: totalShifts, location: locationName }) : t("resumen.noShiftsYet")}</p>
        </div>
        <div className="hero-result">
          <div className="score-ring"><strong>{coveragePct}</strong><span>%</span></div>
          <div><strong>{t("resumen.weekCoverage")}</strong><span>{t("resumen.uncovered", { count: totalShifts - coveredShifts })}</span></div>
        </div>
      </section>

      <section className="metrics-grid">
        <MetricCard label={t("resumen.metric.hours")} value={`${Math.round(assignedHours)} h`} detail={t("resumen.metric.hoursDetail", { count: weekShifts.length })} tone="violet" icon={Clock3} />
        <MetricCard label={t("resumen.metric.coverage")} value={`${coveragePct}%`} detail={t("resumen.metric.coverageDetail", { covered: coveredShifts, total: totalShifts })} tone="green" icon={ShieldCheck} />
        <MetricCard label={t("resumen.metric.team")} value={String(scopedEmployees.length)} detail={t("resumen.metric.teamDetail")} tone="blue" icon={UsersRound} />
        <MetricCard label={t("resumen.metric.pending")} value={String(pendingAbsences.length + openCoverage.length)} detail={t("resumen.metric.pendingDetail")} tone="orange" icon={Sparkles} />
      </section>

      <section className="dashboard-grid">
        <article className="schedule-card">
          <div className="section-heading">
            <div><div className="section-title-line"><h3>{t("resumen.weekPlan")}</h3>{weekShifts.some((s) => s.aiGenerated && !s.published) && <span className="draft-pill">{t("resumen.draft")}</span>}</div><p>{formatWeekRange(weekStart, lang)} · {locationName}</p></div>
            <button className="secondary-button" onClick={onGoPlanner}>{t("resumen.openPlanner")} <ArrowUpRight size={14} /></button>
          </div>
          {weekShifts.length === 0 ? (
            <div className="empty-state">{t("resumen.noShifts")}</div>
          ) : (
            <div className="schedule-scroll">
              <div className="schedule-table">
                <div className="schedule-head employee-head">{t("team.colEmployee")}</div>
                {days.map((d) => <div className="schedule-head day-head" key={d.date}><span>{d.label}</span><strong>{d.dayNumber}</strong></div>)}
                {scopedEmployees.slice(0, 8).map((employee) => (
                  <div className="schedule-row" key={employee.id}>
                    <div className="employee-cell"><div className={`avatar ${employee.color}`}>{initials(employee.name)}</div><div><strong>{employee.name}</strong><span>{employee.occupation}</span></div></div>
                    {days.map((d) => {
                      const shift = weekShifts.find((s) => s.userId === employee.id && s.date === d.date);
                      return <div className="shift-cell" key={d.date}><div className={`shift-block ${shift ? "work" : "empty"}`}>{shift ? <><i /><span>{shift.startTime}–{shift.endTime}</span></> : <span>—</span>}</div></div>;
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}
        </article>

        <aside className="attention-card">
          <div className="section-heading compact"><div><h3>{t("resumen.needsAttention")}</h3><p>{t("resumen.live")}</p></div><span className="attention-count">{pendingAbsences.length + openCoverage.length}</span></div>
          <div className="attention-list">
            {openCoverage.map((c) => (
              <button className="attention-item urgent" key={c.id} onClick={onGoChat}>
                <span className="attention-icon"><AlertTriangle size={17} /></span>
                <span className="attention-copy"><em>{t("resumen.urgentCoverage")}</em><strong>{c.shift ? `${c.shift.date} · ${c.shift.startTime}–${c.shift.endTime}` : t("resumen.unassignedShift")}</strong><small>{c.reason}</small></span>
                <span className="attention-arrow">›</span>
              </button>
            ))}
            {pendingAbsences.map((a) => (
              <button className="attention-item" key={a.id} onClick={onGoAusencias}>
                <span className="attention-icon leave"><Umbrella size={17} /></span>
                <span className="attention-copy"><em>{t("resumen.request")}</em><strong>{absenceLabel(t, a.type)}</strong><small>{a.startDate} – {a.endDate}</small></span>
                <span className="attention-arrow">›</span>
              </button>
            ))}
            {pendingAbsences.length === 0 && openCoverage.length === 0 && <p className="empty-state">{t("resumen.nothingPending")}</p>}
          </div>
        </aside>
      </section>

      <section className="dashboard-grid">
        <article className="schedule-card">
          <div className="section-heading">
            <div><div className="section-title-line"><h3>{t("resumen.todayStaffing")}</h3>{exceptionCount > 0 && <span className="attention-count">{exceptionCount}</span>}</div><p>{t("resumen.todayStaffingSubtitle", { count: todayRows.length })}</p></div>
            <button className="secondary-button" onClick={onGoTimeTracking}>{t("resumen.viewTimeTracking")} <ArrowUpRight size={14} /></button>
          </div>
          {todayRows.length === 0 ? (
            <div className="empty-state">{t("resumen.noShiftsToday")}</div>
          ) : (
            <div>
              {todayRows.map(({ shift, employee, status }) => (
                <div className="permission-row" key={shift.id}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <div className={`avatar ${employee?.color ?? "blue"}`}>{employee ? initials(employee.name) : "?"}</div>
                    <div><strong>{employee?.name ?? "—"}</strong><span>{shift.startTime}–{shift.endTime}</span></div>
                  </div>
                  <em className={`status-pill ${status === "checked_in" ? "available" : status === "checked_out" ? "transfer" : status === "late" ? "away" : ""}`}>
                    {status === "checked_in" && t("resumen.attendance.checkedIn")}
                    {status === "checked_out" && t("resumen.attendance.checkedOut")}
                    {status === "late" && t("resumen.attendance.late")}
                    {status === "upcoming" && t("resumen.attendance.upcoming")}
                  </em>
                </div>
              ))}
            </div>
          )}
        </article>

        <aside className="attention-card">
          <div className="section-heading compact"><div><h3>{t("resumen.labourSignal")}</h3><p>{t("resumen.labourSignalSubtitle")}</p></div><Banknote size={20} /></div>
          {weeklyBudgetCents === 0 ? (
            <p className="empty-state">{t("resumen.labourNoBudget")}</p>
          ) : (
            <div className="budget-row">
              <div><strong>{money(todayLabourCents, locale)}</strong><span>/ {money(dailyBudgetCents, locale)}</span></div>
              <div className="budget-track"><i style={{ width: `${Math.min(labourPct, 100)}%` }} /></div>
              <em className={`status-pill ${labourPct > 100 ? "away" : "available"}`}>{labourPct > 100 ? t("costs.overBudget") : t("costs.onTarget")}</em>
            </div>
          )}
          <button className="text-button" onClick={onGoCosts}>{t("resumen.viewCosts")} <ArrowUpRight size={12} /></button>
        </aside>
      </section>
    </>
  );
}

/* ---------------- My Shift (employee) ---------------- */
export function MyShiftView({ shift, locations, tasks, currentUser }: {
  shift: ShiftT | undefined; locations: LocationT[]; tasks: TaskT[]; currentUser: CurrentUser;
}) {
  const { t } = useLanguage();
  const location = locations.find((l) => l.id === shift?.locationId);
  return (
    <div className="view-stack">
      <div className="view-heading"><div><span className="view-kicker">{t("myshift.kicker")}</span><h2>{shift ? t("myshift.todayAt", { location: location?.name ?? t("myshift.today") }) : t("myshift.noShiftToday")}</h2><p>{t("myshift.onlyYours")}</p></div>
        {shift && <span className="status-pill available">{t("myshift.confirmed")}</span>}
      </div>
      {shift ? (
        <section className="my-shift-grid">
          <article className="my-shift-main"><small>{t("myshift.today")} · {shift.role || currentUser.occupation}</small><strong>{shift.startTime}–{shift.endTime}</strong><span><MapPin size={14} /> {location?.name}</span></article>
          <article><ClipboardCheck size={21} /><strong>{t("myshift.tasksDone", { done: tasks.filter((task) => task.completed).length, total: tasks.length })}</strong><span>{t("myshift.atYourLocation")}</span></article>
        </section>
      ) : (
        <div className="empty-state">{t("myshift.noneToday")}</div>
      )}
    </div>
  );
}

/* ---------------- Planner ---------------- */
export function PlannerView({ employees, shifts, locations, location, weekStart, weekEnd, onPrevWeek, onNextWeek, onToday, onGenerate, onPublish, onAssign, onRequestCoverage }: {
  employees: EmployeeT[]; shifts: ShiftT[]; locations: LocationT[]; location: string;
  weekStart: string; weekEnd: string;
  onPrevWeek: () => void; onNextWeek: () => void; onToday: () => void; onGenerate: () => void; onPublish: () => void;
  onAssign: (shiftId: string, userId: string | null) => void; onRequestCoverage: (shiftId: string) => void;
}) {
  const { t, lang } = useLanguage();
  const days = weekDays(weekStart, lang);
  const scoped = shifts.filter((s) => location === "all" || s.locationId === location);
  const hasDraft = scoped.some((s) => s.aiGenerated === 1 && s.published === 0);
  const [editing, setEditing] = useState<ShiftT | null>(null);
  const [assignTarget, setAssignTarget] = useState<{ employeeId: string; date: string } | null>(null);
  const assignCandidates = assignTarget
    ? scoped.filter((s) => s.status === "open" && s.date === assignTarget.date)
    : [];

  const exportScheduleCsv = () => {
    const rows = [[
      t("planner.csv.employee"),
      t("planner.csv.location"),
      t("planner.csv.date"),
      t("planner.csv.start"),
      t("planner.csv.end"),
      t("planner.csv.status"),
    ]];
    scoped.forEach((s) => {
      const emp = employees.find((e) => e.id === s.userId);
      const loc = locations.find((l) => l.id === s.locationId);
      rows.push([emp?.name ?? t("planner.csv.unassigned"), loc?.name ?? "", s.date, s.startTime, s.endTime, s.status]);
    });
    const csv = rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `schedule-${weekStart}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="view-stack">
      <div className="view-heading">
        <div><span className="view-kicker">{t("planner.kicker")}</span><h2>{formatWeekRange(weekStart, lang)}</h2><p>{t("planner.subtitle")}</p></div>
        <div className="view-actions">
          {hasDraft && <button className="secondary-button" onClick={onPublish}><FileCheck2 size={15} /> {t("planner.publish")}</button>}
          <button className="primary-button" onClick={onGenerate}><WandSparkles size={16} /> {t("planner.regenerate")}</button>
        </div>
      </div>

      <div className="planner-layout">
        <article className="schedule-card full-schedule">
          <div className="section-heading">
            <div><div className="section-title-line"><h3>{location === "all" ? t("shell.allLocations") : locations.find((l) => l.id === location)?.name}</h3>{hasDraft && <span className="draft-pill">{t("resumen.draft")}</span>}</div><p>{t("planner.employeesCount", { count: employees.length })} · {t("planner.shiftsCount", { count: scoped.length })}</p></div>
            <div className="section-actions"><button className="secondary-button" onClick={onToday}>{t("planner.today")}</button><button className="circle-button" onClick={onPrevWeek} aria-label={t("planner.prevWeek")}>‹</button><button className="circle-button" onClick={onNextWeek} aria-label={t("planner.nextWeek")}>›</button></div>
          </div>
          {employees.length === 0 ? <div className="empty-state">{t("planner.addEmployeesFirst")}</div> : (
            <div className="schedule-scroll">
              <div className="schedule-table planner-table">
                <div className="schedule-head employee-head">{t("team.colEmployee")}</div>
                {days.map((d) => <div className="schedule-head day-head" key={d.date}><span>{d.label}</span><strong>{d.dayNumber}</strong></div>)}
                {employees.map((employee) => (
                  <div className="schedule-row" key={employee.id}>
                    <div className="employee-cell"><div className={`avatar ${employee.color}`}>{initials(employee.name)}</div><div><strong>{employee.name}</strong><span>{employee.occupation}</span></div></div>
                    {days.map((d) => {
                      const shift = scoped.find((s) => s.userId === employee.id && s.date === d.date);
                      const hasOpenCandidate = scoped.some((s) => s.status === "open" && s.date === d.date);
                      return (
                        <div className="shift-cell" key={d.date}>
                          <button
                            type="button"
                            className={`shift-block ${shift ? "work" : "empty"}`}
                            onClick={() => (shift ? setEditing(shift) : hasOpenCandidate && setAssignTarget({ employeeId: employee.id, date: d.date }))}
                            style={{ border: 0, cursor: shift || hasOpenCandidate ? "pointer" : "default", width: "100%" }}
                            aria-label={shift ? undefined : hasOpenCandidate ? t("planner.assignAction") : undefined}
                          >
                            {shift ? <><i /><span>{shift.startTime}–{shift.endTime}</span></> : <span>—</span>}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ))}
                {scoped.filter((s) => s.status === "open").length > 0 && (
                  <div className="schedule-row">
                    <div className="employee-cell"><div className="avatar orange">?</div><div><strong>{t("planner.uncovered")}</strong><span>{t("planner.openShifts")}</span></div></div>
                    {days.map((d) => {
                      const open = scoped.find((s) => s.status === "open" && s.date === d.date);
                      return <div className="shift-cell" key={d.date}>{open ? <button className="shift-block blocked" onClick={() => onRequestCoverage(open.id)} style={{ border: 0, width: "100%", cursor: "pointer" }}><span>{open.startTime}–{open.endTime}</span></button> : <div className="shift-block empty"><span>—</span></div>}</div>;
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="schedule-legend"><span><i className="legend-work" /> {t("planner.assigned")}</span><span><i className="legend-off" /> {t("planner.unassigned")}</span><button onClick={exportScheduleCsv}>{t("planner.exportSchedule")} <ArrowUpRight size={14} /></button></div>
        </article>

        <aside className="rules-panel">
          <div className="rules-panel-head"><Sparkles size={17} /><div><strong>{t("planner.aiRulesTitle")}</strong><span>{t("planner.aiRulesSubtitle")}</span></div></div>
          <div className="rule-decision"><span className="decision-number">01</span><div><strong>{t("planner.rule1Title")}</strong><p>{t("planner.rule1Body")}</p></div></div>
          <div className="rule-decision"><span className="decision-number">02</span><div><strong>{t("planner.rule2Title")}</strong><p>{t("planner.rule2Body")}</p></div></div>
          <div className="rule-decision"><span className="decision-number">03</span><div><strong>{t("planner.rule3Title")}</strong><p>{t("planner.rule3Body")}</p></div></div>
        </aside>
      </div>

      {editing && (() => {
        const conflicts = editing.userId ? conflictingShifts(shifts, editing.userId, editing.date, editing.startTime, editing.endTime, editing.id) : [];
        return (
          <div className="modal-backdrop" onMouseDown={() => setEditing(null)}>
            <section className="ai-modal transfer-modal" onMouseDown={(e) => e.stopPropagation()}>
              <button className="modal-close" onClick={() => setEditing(null)} aria-label={t("common.close")}><X size={18} /></button>
              <div className="modal-orb transfer-orb"><CalendarDays size={22} /></div>
              <span className="modal-kicker">{t("planner.shiftKicker")}</span>
              <h2>{editing.date} · {editing.startTime}–{editing.endTime}</h2>
              <p>{t("planner.shiftModalBody")}</p>
              {conflicts.length > 0 && (
                <div className="geofence-monitor warning">
                  <AlertTriangle size={18} />
                  <div><strong>{t("planner.conflictTitle")}</strong><span>{t("planner.conflictBody", { count: conflicts.length })}</span></div>
                </div>
              )}
              <div className="modal-account-actions">
                <button className="secondary-button" onClick={() => { onAssign(editing.id, null); setEditing(null); }}>{t("planner.unassign")}</button>
                <button className="primary-button modal-action" onClick={() => { onRequestCoverage(editing.id); setEditing(null); }}><Send size={15} /> {t("planner.requestCoverage")}</button>
              </div>
            </section>
          </div>
        );
      })()}

      {assignTarget && (() => {
        const employee = employees.find((e) => e.id === assignTarget.employeeId);
        return (
          <div className="modal-backdrop" onMouseDown={() => setAssignTarget(null)}>
            <section className="ai-modal transfer-modal" onMouseDown={(e) => e.stopPropagation()}>
              <button className="modal-close" onClick={() => setAssignTarget(null)} aria-label={t("common.close")}><X size={18} /></button>
              <div className="modal-orb transfer-orb"><UsersRound size={22} /></div>
              <span className="modal-kicker">{t("planner.assignKicker")}</span>
              <h2>{employee?.name} · {assignTarget.date}</h2>
              <p>{t("planner.assignBody")}</p>
              {assignCandidates.length === 0 ? (
                <div className="empty-state">{t("planner.assignEmpty")}</div>
              ) : (
                <div className="assign-candidate-list">
                  {assignCandidates.map((candidate) => {
                    const conflicts = conflictingShifts(shifts, assignTarget.employeeId, candidate.date, candidate.startTime, candidate.endTime);
                    const locName = locations.find((l) => l.id === candidate.locationId)?.name ?? "";
                    return (
                      <div className="assign-candidate-row" key={candidate.id}>
                        <div>
                          <strong>{candidate.startTime}–{candidate.endTime}</strong>
                          <span>{locName}</span>
                          {conflicts.length > 0 && <em className="conflict-note"><AlertTriangle size={12} /> {t("planner.conflictBody", { count: conflicts.length })}</em>}
                        </div>
                        <button className="secondary-button" onClick={() => { onAssign(candidate.id, assignTarget.employeeId); setAssignTarget(null); }}>{t("planner.assignAction")}</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        );
      })()}
    </div>
  );
}

/* ---------------- Time tracking ---------------- */
export function TimeTrackingView({ location, locations, employees, currentUser, shift, onError }: {
  location: LocationT | null; locations: LocationT[]; employees: EmployeeT[]; currentUser: CurrentUser; shift: ShiftT | undefined; onError: (error: unknown) => void;
}) {
  const { t } = useLanguage();
  const [distance, setDistance] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<OpenAttendanceT | null>(null);
  const [openBreak, setOpenBreak] = useState<{ id: string; startAt: string } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [breakBusy, setBreakBusy] = useState(false);

  useEffect(() => {
    apiFetch("/api/attendance").then((r) => r.json()).then((data) => { setOpen(data.open); setOpenBreak(data.openBreak ?? null); setLoaded(true); }).catch(() => setLoaded(true));
  }, []);

  const inside = location && distance !== null && distance <= location.radiusMeters && (accuracy ?? 999) <= 60;

  const locate = async () => {
    if (!location) return;
    setLocating(true);
    try {
      const permissions = await Geolocation.requestPermissions();
      if (permissions.location === "denied") throw new Error(t("time.locationDenied"));
      const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 });
      setDistance(distanceInMeters(position.coords.latitude, position.coords.longitude, location.latitude, location.longitude));
      setAccuracy(position.coords.accuracy);
      setCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("time.locationError"));
    } finally { setLocating(false); }
  };

  const checkIn = async () => {
    if (!location) return;
    try {
      const response = await apiFetch("/api/attendance", {
        method: "POST",
        body: JSON.stringify({ action: "check-in", shiftId: shift?.id, locationId: location.id, lat: coords?.lat, lng: coords?.lng }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setOpen({ id: data.id, checkInAt: new Date().toISOString(), checkOutAt: null });
    } catch (e) { onError(e); }
  };

  const checkOut = async () => {
    if (!open) return;
    try {
      await apiFetch("/api/attendance", { method: "POST", body: JSON.stringify({ action: "check-out", id: open.id }) });
      setOpen(null);
      setOpenBreak(null);
    } catch (e) { onError(e); }
  };

  const toggleBreak = async () => {
    setBreakBusy(true);
    try {
      if (openBreak) {
        await apiFetch("/api/attendance/break", { method: "POST", body: JSON.stringify({ action: "end", id: openBreak.id }) });
        setOpenBreak(null);
      } else {
        const response = await apiFetch("/api/attendance/break", { method: "POST", body: JSON.stringify({ action: "start" }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setOpenBreak({ id: data.id, startAt: new Date().toISOString() });
      }
    } catch (e) { onError(e); } finally { setBreakBusy(false); }
  };

  const isManager = currentUser.role !== "employee";
  if (!location && !isManager) return <div className="view-stack"><div className="empty-state">{t("time.createLocationFirst")}</div></div>;

  return (
    <div className="view-stack">
      {location && (
        <>
          <div className="view-heading"><div><span className="view-kicker">{t("time.kicker")}</span><h2>{t("time.title", { radius: location.radiusMeters })}</h2><p>{t("time.subtitle")}</p></div><span className={`geo-status ${inside ? "inside" : "outside"}`}><MapPin size={15} /> {distance === null ? t("time.pending") : inside ? t("time.inside") : t("time.outside")}</span></div>
          {!location.verified && (
            <div className="geofence-monitor warning">
              <AlertTriangle size={18} />
              <div><strong>{t("time.unverifiedTitle")}</strong><span>{t("time.unverifiedBody")}</span></div>
            </div>
          )}
          <section className="geo-card">
            <div className="geo-radar"><span className={inside ? "device-dot inside" : "device-dot"} /><i /><b>{location.radiusMeters} m</b></div>
            <div className="geo-copy">
              <span className="view-kicker">{location.name}</span>
              <h3>{distance === null ? t("time.checkLocation") : t("time.metersFromSite", { meters: Math.round(distance) })}</h3>
              <p>{t("time.accuracy", { accuracy: accuracy === null ? "—" : `±${Math.round(accuracy)} m` })}</p>
              {error && <em className="geo-error"><AlertTriangle size={14} /> {error}</em>}
              <div className="geo-actions"><button className="secondary-button" onClick={locate} disabled={locating}><MapPin size={15} /> {locating ? t("time.locating") : t("time.updateLocation")}</button></div>
            </div>
            <div className="clock-panel">
              <small>{shift ? t("time.todayShift") : t("time.noShiftToday")}</small>
              <strong>{shift ? `${shift.startTime}–${shift.endTime}` : "—"}</strong>
              {!loaded ? null : !open ? (
                <button className="primary-button" disabled={!inside || !location.verified} onClick={checkIn}><Fingerprint size={17} /> {location.verified ? t("time.checkIn") : t("time.checkInBlocked")}</button>
              ) : (
                <>
                  <span className="clocked"><i /> {openBreak ? t("time.onBreakSince", { time: new Date(openBreak.startAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }) : t("time.checkedInAt", { time: new Date(open.checkInAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) })}</span>
                  <div className="clock-panel-actions">
                    <button className="secondary-button" onClick={toggleBreak} disabled={breakBusy}><Clock3 size={15} /> {openBreak ? t("time.endBreak") : t("time.startBreak")}</button>
                    <button className="primary-button" onClick={checkOut}>{t("time.checkOut")}</button>
                  </div>
                </>
              )}
            </div>
          </section>
        </>
      )}
      {isManager && <TimesheetReviewSection employees={employees} locations={locations} />}
    </div>
  );
}

/* ---------------- Manager timesheet review ---------------- */
function TimesheetReviewSection({ employees, locations }: { employees: EmployeeT[]; locations: LocationT[] }) {
  const { t, lang } = useLanguage();
  const [weekStart, setWeekStart] = useState(() => toISODate(startOfWeek()));
  const weekEnd = toISODate(addDays(new Date(`${weekStart}T00:00:00`), 6));
  const [records, setRecords] = useState<TimesheetRowT[]>([]);
  const [loading, setLoading] = useState(true);
  const [correcting, setCorrecting] = useState<TimesheetRowT | null>(null);
  const [checkInDraft, setCheckInDraft] = useState("");
  const [checkOutDraft, setCheckOutDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () => {
    apiFetch(`/api/attendance/timesheet?weekStart=${weekStart}&weekEnd=${weekEnd}`)
      .then((r) => r.json()).then((data) => setRecords(data.records ?? [])).finally(() => setLoading(false));
  };
  useEffect(() => {
    // Marks the week as loading as soon as it changes, without calling
    // setState synchronously inside the effect body — deferred a tick via
    // queueMicrotask so React finishes the current commit first.
    queueMicrotask(() => setLoading(true));
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch on week change only; `load` itself is stable per render and re-including it would refetch on every render.
  }, [weekStart]);

  const employeeName = (id: string, fallback: string) => employees.find((e) => e.id === id)?.name ?? fallback;
  const locationName = (id: string | null) => (id && locations.find((l) => l.id === id)?.name) || "—";

  const approve = async (row: TimesheetRowT) => {
    await apiFetch(`/api/attendance/${row.id}`, { method: "PATCH", body: JSON.stringify({ approved: true }) });
    load();
  };
  const startCorrect = (row: TimesheetRowT) => {
    setCorrecting(row);
    setCheckInDraft(row.checkInAt ? toLocalInputValue(row.checkInAt) : "");
    setCheckOutDraft(row.checkOutAt ? toLocalInputValue(row.checkOutAt) : "");
  };
  const saveCorrection = async () => {
    if (!correcting || !checkInDraft) return;
    setSaving(true);
    try {
      await apiFetch(`/api/attendance/${correcting.id}`, {
        method: "PATCH",
        body: JSON.stringify({ checkInAt: fromLocalInputValue(checkInDraft), checkOutAt: checkOutDraft ? fromLocalInputValue(checkOutDraft) : null }),
      });
      setCorrecting(null);
      load();
    } finally { setSaving(false); }
  };

  return (
    <article className="data-card timesheet-card">
      <div className="section-heading">
        <div><h3>{t("time.timesheetTitle")}</h3><p>{formatWeekRange(weekStart, lang)}</p></div>
        <div className="section-actions">
          <button className="secondary-button" onClick={() => setWeekStart(toISODate(startOfWeek()))}>{t("planner.today")}</button>
          <button className="circle-button" onClick={() => setWeekStart(toISODate(addDays(new Date(`${weekStart}T00:00:00`), -7)))} aria-label={t("planner.prevWeek")}>‹</button>
          <button className="circle-button" onClick={() => setWeekStart(toISODate(addDays(new Date(`${weekStart}T00:00:00`), 7)))} aria-label={t("planner.nextWeek")}>›</button>
        </div>
      </div>
      {loading ? <div className="empty-state">{t("shell.loading")}</div> : records.length === 0 ? (
        <div className="empty-state">{t("time.timesheetEmpty")}</div>
      ) : (
        <div className="timesheet-table">
          <div className="timesheet-row timesheet-head">
            <span>{t("team.colEmployee")}</span><span>{t("time.scheduledCol")}</span><span>{t("time.actualCol")}</span><span>{t("time.breaksCol")}</span><span>{t("time.varianceCol")}</span><span>{t("team.colStatus")}</span><span />
          </div>
          {records.map((row) => {
            const scheduledMin = row.shiftStart && row.shiftEnd ? hoursBetween(row.shiftStart, row.shiftEnd) * 60 : null;
            const actualMin = row.checkInAt && row.checkOutAt ? (new Date(row.checkOutAt).getTime() - new Date(row.checkInAt).getTime()) / 60000 : null;
            // Variance is against NET worked time (actual minus break minutes),
            // not raw clocked duration — a 30-minute lunch shouldn't read as
            // "30 minutes over schedule".
            const variance = scheduledMin !== null && actualMin !== null ? Math.round(actualMin - row.breakMinutes - scheduledMin) : null;
            return (
              <div className="timesheet-row" key={row.id}>
                <span className="person-summary"><span className={`avatar ${employees.find((e) => e.id === row.userId)?.color ?? "blue"}`}>{initials(employeeName(row.userId, row.userName))}</span><span><strong>{employeeName(row.userId, row.userName)}</strong><small>{locationName(row.shiftLocationId)}</small></span></span>
                <span>{row.shiftStart && row.shiftEnd ? `${row.shiftDate} · ${row.shiftStart}–${row.shiftEnd}` : t("time.noSchedule")}</span>
                <span>{row.checkInAt ? new Date(row.checkInAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}–{row.checkOutAt ? new Date(row.checkOutAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : t("time.stillOpen")}{row.autoCheckout === 1 && <em className="conflict-note">{t("time.autoCheckoutTag")}</em>}</span>
                <span>{row.breakMinutes > 0 ? `${row.breakMinutes} min` : "—"}{row.onBreak && <em className="conflict-note">{t("time.onBreakTag")}</em>}</span>
                <span className={variance === null ? "" : Math.abs(variance) < 10 ? "variance-ok" : "variance-warn"}>{variance === null ? "—" : `${variance > 0 ? "+" : ""}${variance} min`}</span>
                <span><em className={`status-pill ${row.approved ? "available" : "away"}`}>{row.approved ? t("time.approved") : t("time.pendingReview")}</em></span>
                <span className="timesheet-actions">
                  <button className="row-action" onClick={() => startCorrect(row)}>{t("time.correct")}</button>
                  {!row.approved && <button className="row-action" onClick={() => approve(row)}>{t("time.approve")}</button>}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {correcting && (
        <div className="modal-backdrop" onMouseDown={() => setCorrecting(null)}>
          <section className="ai-modal account-modal" onMouseDown={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setCorrecting(null)} aria-label={t("common.close")}><X size={18} /></button>
            <div className="modal-orb"><Clock3 size={22} /></div>
            <span className="modal-kicker">{t("time.correctKicker")}</span>
            <h2>{employeeName(correcting.userId, correcting.userName)}</h2>
            <div className="transfer-form">
              <label><span>{t("time.checkInLabel")}</span><input type="datetime-local" value={checkInDraft} onChange={(e) => setCheckInDraft(e.target.value)} /></label>
              <label><span>{t("time.checkOutLabel")}</span><input type="datetime-local" value={checkOutDraft} onChange={(e) => setCheckOutDraft(e.target.value)} /></label>
            </div>
            <p className="preview-note">{t("time.correctNote")}</p>
            <div className="modal-account-actions">
              <button className="secondary-button" onClick={() => setCorrecting(null)}>{t("common.close")}</button>
              <button className="primary-button modal-action" disabled={saving || !checkInDraft} onClick={saveCorrection}>{saving ? t("team.saving") : t("time.saveCorrection")}</button>
            </div>
          </section>
        </div>
      )}
    </article>
  );
}

/* ---------------- Daily operations ---------------- */
export function DailyOperationsView({ tasks, locations, employees, locationId, currentUserId, onCreate, onToggle }: {
  tasks: TaskT[]; locations: LocationT[]; employees: EmployeeT[]; locationId: string | undefined; currentUserId: string;
  onCreate: (input: { name: string; locationId: string; dueTime: string; ownerUserId: string }) => void;
  onToggle: (id: string, completed: boolean) => void;
}) {
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const [taskLocationId, setTaskLocationId] = useState(locationId ?? "");
  const [dueTime, setDueTime] = useState("09:00");
  const [ownerUserId, setOwnerUserId] = useState(currentUserId);
  const effectiveLocationId = taskLocationId || locationId || "";
  const locationName = (id: string) => locations.find((l) => l.id === id)?.name ?? "—";
  const ownerName = (id: string | null) => employees.find((e) => e.id === id)?.name ?? t("ops.unassignedOwner");

  return (
    <div className="view-stack">
      <div className="view-heading"><div><span className="view-kicker">{t("ops.kicker")}</span><h2>{t("ops.title")}</h2><p>{t("ops.subtitle")}</p></div></div>
      <div className="filter-row ops-new-task-row">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("ops.newTaskPlaceholder")} aria-label={t("ops.newTaskPlaceholder")} style={{ flex: 1, border: "1px solid var(--line)", borderRadius: 10, padding: "8px 11px", fontSize: 12 }} />
        {locations.length > 1 && (
          <select aria-label={t("ops.locationLabel")} value={effectiveLocationId} onChange={(e) => setTaskLocationId(e.target.value)}>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        )}
        <select aria-label={t("ops.ownerLabel")} value={ownerUserId} onChange={(e) => setOwnerUserId(e.target.value)}>
          {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <input type="time" aria-label={t("ops.dueTimeLabel")} value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
        <button className="primary-button" disabled={!name.trim() || !effectiveLocationId} onClick={() => { onCreate({ name: name.trim(), locationId: effectiveLocationId, dueTime, ownerUserId }); setName(""); }}>{t("ops.addTask")}</button>
      </div>
      {tasks.length === 0 ? <div className="empty-state">{t("ops.noTasks")}</div> : (
        <section className="task-board">
          {tasks.map((task, index) => (
            <article className={task.completed ? "task-item complete" : "task-item"} key={task.id}>
              <span className="task-check">{task.completed ? <Check size={18} /> : index + 1}</span>
              <div>
                <small>{task.dueTime} · {locationName(task.locationId)}</small>
                <h3>{task.name}</h3>
                <p>{task.completed ? t("ops.complete") : t("ops.pending")} · {t("ops.ownedBy", { name: ownerName(task.ownerUserId) })}</p>
              </div>
              {!task.completed && <button className="secondary-button" onClick={() => onToggle(task.id, true)}>{t("ops.markComplete")}</button>}
            </article>
          ))}
        </section>
      )}
    </div>
  );
}

/* ---------------- Costs & payroll ---------------- */
export function CostsView({ locations, employees, shifts }: { locations: LocationT[]; employees: EmployeeT[]; shifts: ShiftT[] }) {
  const { t, locale, lang } = useLanguage();

  const exportCsv = () => {
    const rows = [[
      t("costs.csv.location"),
      t("costs.csv.employee"),
      t("costs.csv.date"),
      t("costs.csv.start"),
      t("costs.csv.end"),
      t("costs.csv.hours"),
      t("costs.csv.rate"),
      t("costs.csv.cost"),
    ]];
    locations.forEach((loc) => {
      shifts.filter((s) => s.locationId === loc.id && s.userId).forEach((s) => {
        const emp = employees.find((e) => e.id === s.userId);
        if (!emp) return;
        const hours = hoursBetween(s.startTime, s.endTime);
        // Multiply in integer cents first, and only convert to decimal once
        // at the very end — avoids compounding floating-point rounding
        // error across the rate → cost conversion.
        const costCents = Math.round(hours * (emp.hourlyRateCents ?? 0));
        rows.push([loc.name, emp.name, s.date, s.startTime, s.endTime, hours.toFixed(2), ((emp.hourlyRateCents ?? 0) / 100).toFixed(2), (costCents / 100).toFixed(2)]);
      });
    });
    const csv = rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `payroll-${todayISO()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="view-stack">
      <div className="view-heading"><div><span className="view-kicker">{t("costs.kicker")}</span><h2>{t("costs.title")}</h2><p>{t("costs.subtitle")}</p></div><button className="primary-button" onClick={exportCsv}><ReceiptText size={16} /> {t("costs.exportCsv")}</button></div>
      <article className="data-card budget-card">
        <div className="card-heading"><div><h3>{t("costs.budgetByLocation")}</h3><p>{t("costs.budgetSubtitle")}</p></div><Bot size={20} /></div>
        {locations.map((loc) => {
          const locShifts = shifts.filter((s) => s.locationId === loc.id && s.userId);
          // This is the SCHEDULED (forecast) labour cost — every assigned
          // shift's hours × rate, whether or not it's been worked yet. It is
          // not the approved/actual payroll figure (11.4 wants those kept
          // visually distinct); that needs manager-reviewed timesheets,
          // which this build doesn't have yet — see the project doc.
          const forecastCents = locShifts.reduce((sum, s) => {
            const emp = employees.find((e) => e.id === s.userId);
            return sum + (emp ? (emp.hourlyRateCents ?? 0) * hoursBetween(s.startTime, s.endTime) : 0);
          }, 0);
          const budgetCents = loc.budgetCents ?? 0;
          const percent = budgetCents > 0 ? Math.round((forecastCents / budgetCents) * 100) : 0;
          return (
            <div className="budget-row" key={loc.id}>
              <div><strong>{loc.name}</strong><span>{money(forecastCents, locale)} {(loc.budgetCents ?? 0) > 0 ? `/ ${money(loc.budgetCents ?? 0, locale)}` : t("costs.noBudget")}</span></div>
              <div className="budget-track"><i style={{ width: `${Math.min(percent, 100)}%` }} /></div>
              <em className={`status-pill ${percent > 100 ? "away" : "available"}`}>{(loc.budgetCents ?? 0) === 0 ? t("costs.setBudget") : percent > 100 ? t("costs.overBudget") : t("costs.onTarget")}</em>
            </div>
          );
        })}
        {locations.length === 0 && <div className="empty-state">{t("costs.noLocations")}</div>}
        <p className="preview-note">{t("costs.forecastNote")}</p>
      </article>
    </div>
  );
}

/* ---------------- Team ---------------- */
export function TeamView({ employees, locations, onTransfer, onEdit }: {
  employees: EmployeeT[]; locations: LocationT[]; onTransfer: (employee: EmployeeT) => void;
  onEdit: (employeeId: string, patch: { occupation: string; weeklyHourTarget: number; hourlyRate: number }) => Promise<void>;
}) {
  const { t, locale } = useLanguage();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<EmployeeT | null>(null);
  const [occupation, setOccupation] = useState("");
  const [weeklyHourTarget, setWeeklyHourTarget] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [saving, setSaving] = useState(false);
  const filtered = employees.filter((e) => `${e.name} ${e.occupation}`.toLowerCase().includes(query.toLowerCase()));
  const locationName = (id: string | null) => locations.find((l) => l.id === id)?.name ?? t("team.unassigned");

  const startEdit = (person: EmployeeT) => {
    setEditing(person);
    setOccupation(person.occupation);
    setWeeklyHourTarget(String(person.weeklyHourTarget ?? 0));
    setHourlyRate(((person.hourlyRateCents ?? 0) / 100).toFixed(2));
  };
  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await onEdit(editing.id, { occupation: occupation.trim(), weeklyHourTarget: Number(weeklyHourTarget) || 0, hourlyRate: Number(hourlyRate) || 0 });
      setEditing(null);
    } finally { setSaving(false); }
  };

  return (
    <div className="view-stack">
      <div className="view-heading"><div><span className="view-kicker">{t("team.kicker")}</span><h2>{t("team.peopleCount", { count: employees.length })}</h2><p>{t("team.subtitle")}</p></div><label className="directory-search"><Search size={15} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("team.search")} /></label></div>
      <article className="data-card">
        <div className="team-table table-head"><span>{t("team.colEmployee")}</span><span>{t("team.colHome")}</span><span>{t("team.colCurrent")}</span><span>{t("team.colRate")}</span><span>{t("team.colStatus")}</span><span /></div>
        {filtered.map((person) => (
          <div className="team-table table-row" key={person.id}>
            <span className="person-summary"><span className={`avatar ${person.color}`}>{initials(person.name)}</span><span><strong>{person.name}</strong><small>{person.occupation}</small></span></span>
            <span><MapPin size={13} /> {locationName(person.homeLocationId)}</span>
            <span><Building2 size={13} /> {locationName(person.currentLocationId)}</span>
            <span className="hours-cell"><strong>{money(person.hourlyRateCents ?? 0, locale)}</strong></span>
            <span><em className={`status-pill ${person.homeLocationId === person.currentLocationId ? "available" : "transfer"}`}>{person.homeLocationId === person.currentLocationId ? t("team.atHome") : t("team.transferred")}</em></span>
            <span className="team-row-actions">
              <button className="row-action" onClick={() => startEdit(person)}>{t("team.edit")}</button>
              <button className="row-action" onClick={() => onTransfer(person)}>{t("team.transfer")} <ArrowLeftRight size={13} /></button>
            </span>
          </div>
        ))}
        {filtered.length === 0 && <p className="empty-state">{t("team.noResults")}</p>}
      </article>

      {editing && (
        <div className="modal-backdrop" onMouseDown={() => setEditing(null)}>
          <section className="ai-modal account-modal" onMouseDown={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setEditing(null)} aria-label={t("common.close")}><X size={18} /></button>
            <div className="modal-orb transfer-orb"><UsersRound size={22} /></div>
            <span className="modal-kicker">{t("team.editKicker")}</span>
            <h2>{editing.name}</h2>
            <div className="transfer-form">
              <label><span>{t("team.occupationLabel")}</span><input value={occupation} onChange={(e) => setOccupation(e.target.value)} maxLength={100} /></label>
              <div className="date-fields">
                <label><span>{t("team.weeklyTargetLabel")}</span><input type="number" min={0} max={80} value={weeklyHourTarget} onChange={(e) => setWeeklyHourTarget(e.target.value)} /></label>
                <label><span>{t("team.rateLabel")}</span><input type="number" min={0} step="0.01" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} /></label>
              </div>
            </div>
            <div className="modal-account-actions">
              <button className="secondary-button" onClick={() => setEditing(null)}>{t("common.close")}</button>
              <button className="primary-button modal-action" disabled={saving || !occupation.trim()} onClick={save}>{saving ? t("team.saving") : t("team.save")}</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

/* ---------------- Transfers ---------------- */
export function TransfersView({ employees, locations, transfers, onNew, onComplete }: {
  employees: EmployeeT[]; locations: LocationT[]; transfers: TransferT[]; onNew: () => void; onComplete: (id: string) => void;
}) {
  const { t } = useLanguage();
  const locationName = (id: string) => locations.find((l) => l.id === id)?.name ?? "—";
  const employeeName = (id: string) => employees.find((e) => e.id === id)?.name ?? "—";
  const active = transfers.filter((tr) => tr.status === "active");
  const completed = transfers.filter((tr) => tr.status === "completed");
  return (
    <div className="view-stack">
      <div className="view-heading"><div><span className="view-kicker">{t("transfers.kicker")}</span><h2>{t("transfers.title")}</h2><p>{t("transfers.subtitle")}</p></div><button className="primary-button" onClick={onNew} disabled={employees.length === 0}><ArrowLeftRight size={16} /> {t("transfers.new")}</button></div>
      <section className="transfer-summary-grid">
        <article><span className="summary-icon violet"><ArrowLeftRight size={18} /></span><div><small>{t("transfers.activeNow")}</small><strong>{active.length}</strong><p>{t("transfers.inProgress")}</p></div></article>
        <article><span className="summary-icon green"><CheckCircle2 size={18} /></span><div><small>{t("transfers.completed")}</small><strong>{completed.length}</strong><p>{t("transfers.history")}</p></div></article>
      </section>
      <article className="data-card transfer-list-card">
        <div className="card-heading"><div><h3>{t("transfers.activeList")}</h3></div><span>{active.length}</span></div>
        {active.map((tr) => (
          <div className="transfer-route-row" key={tr.id}>
            <div className="person-summary"><span className="avatar green">{initials(employeeName(tr.userId))}</span><span><strong>{employeeName(tr.userId)}</strong></span></div>
            <div className="route-visual"><span><small>{t("transfers.origin")}</small><strong>{locationName(tr.fromLocationId)}</strong></span><i><ArrowUpRight size={15} /></i><span><small>{t("transfers.destination")}</small><strong>{locationName(tr.toLocationId)}</strong></span></div>
            <div><em className="status-pill transfer">{tr.type === "permanent" ? t("transfers.permanent") : t("transfers.temporary")}</em><small className="date-note">{t("transfers.since", { date: tr.startDate })}</small></div>
            <button className="row-action" onClick={() => onComplete(tr.id)}>{t("transfers.finish")}</button>
          </div>
        ))}
        {active.length === 0 && <p className="empty-state">{t("transfers.none")}</p>}
      </article>
    </div>
  );
}

/* ---------------- Absences (manager) ---------------- */
export function AbsencesView({ absences, employees, shifts, onDecide }: {
  absences: AbsenceT[]; employees: EmployeeT[]; shifts: ShiftT[]; onDecide: (id: string, status: string) => void;
}) {
  const { t } = useLanguage();
  const employeeName = (id: string) => employees.find((e) => e.id === id)?.name ?? "—";
  const pending = absences.filter((a) => a.status === "pending");
  const decided = absences.filter((a) => a.status !== "pending").slice(0, 6);
  // Impact on published shifts (11.4: "manager approval queue with impact on
  // published shifts") — a published, assigned shift for this employee that
  // falls inside the requested window would go uncovered if approved.
  const affectedShifts = (request: AbsenceT) => shifts.filter((s) => s.userId === request.userId && s.published === 1 && s.date >= request.startDate && s.date <= request.endDate);
  return (
    <div className="view-stack">
      <div className="view-heading"><div><span className="view-kicker">{t("absences.kicker")}</span><h2>{t("absences.title")}</h2><p>{t("absences.subtitle")}</p></div></div>
      <section className="absence-layout">
        <section className="requests-column">
          <div className="card-heading no-border"><div><h3>{t("absences.pending")}</h3></div><span>{pending.length}</span></div>
          {pending.map((request) => {
            const affected = affectedShifts(request);
            return (
            <article className="request-card featured-request" key={request.id}>
              <div className="request-person"><span className="avatar pink">{initials(employeeName(request.userId))}</span><div><strong>{employeeName(request.userId)}</strong></div><em>{absenceLabel(t, request.type).toUpperCase()}</em></div>
              <div className="request-period"><CalendarDays size={17} /><span><small>{t("absences.requestedPeriod")}</small><strong>{request.startDate} – {request.endDate}</strong></span></div>
              {request.note && <p style={{ margin: "6px 0", fontSize: 12, color: "var(--muted)" }}>{request.note}</p>}
              {affected.length > 0 ? (
                <div className="impact-warning"><AlertTriangle size={15} /><div><strong>{t("absences.impactWarningTitle")}</strong><span>{t("absences.impactWarningBody", { count: affected.length })}</span></div></div>
              ) : (
                <div className="impact-ok"><CheckCircle2 size={15} /><div><strong>{t("absences.impactOkTitle")}</strong><span>{t("absences.impactOkBody")}</span></div></div>
              )}
              <div className="request-actions"><button className="secondary-button" onClick={() => onDecide(request.id, "rejected")}>{t("absences.reject")}</button><button className="primary-button" onClick={() => onDecide(request.id, "approved")}><Check size={15} /> {t("absences.approve")}</button></div>
            </article>
          );})}
          {pending.length === 0 && <p className="empty-state">{t("absences.none")}</p>}
        </section>
        <aside className="employee-preview-card">
          <div className="phone-label"><span><strong>{t("absences.recentDecisions")}</strong></span></div>
          {decided.map((r) => (
            <div key={r.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--line)", fontSize: 12 }}>
              <span>{employeeName(r.userId)} · {r.startDate}</span><em className={`status-pill ${r.status === "approved" ? "available" : "away"}`}>{r.status === "approved" ? t("absences.approved") : t("absences.rejected")}</em>
            </div>
          ))}
          {decided.length === 0 && <p className="preview-note">{t("absences.noHistory")}</p>}
        </aside>
      </section>
    </div>
  );
}

/* ---------------- My absences (employee) ---------------- */
export function MyAbsencesView({ unavailableDays, absences, onToggleDay, onRequest }: {
  unavailableDays: string[]; absences: AbsenceT[];
  onToggleDay: (date: string) => void;
  onRequest: (type: string, startDate: string, endDate: string, note: string) => void;
}) {
  const { t } = useLanguage();
  const [requesting, setRequesting] = useState(false);
  const [type, setType] = useState("vacation");
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const nextDays = weekDays(todayISO());

  return (
    <div className="view-stack">
      <div className="view-heading"><div><span className="view-kicker">{t("myabsences.kicker")}</span><h2>{t("myabsences.title")}</h2><p>{t("myabsences.subtitle")}</p></div><button className="primary-button" onClick={() => setRequesting(true)}><Umbrella size={16} /> {t("myabsences.request")}</button></div>
      <article className="data-card personal-absence">
        <div className="card-heading"><div><h3>{t("myabsences.availability")}</h3><p>{t("myabsences.availabilitySubtitle")}</p></div></div>
        <div className="availability-week">
          {nextDays.map((d) => (
            <button key={d.date} className={unavailableDays.includes(d.date) ? "unavailable" : ""} onClick={() => onToggleDay(d.date)}>
              <span>{d.dayNumber}</span><small>{unavailableDays.includes(d.date) ? t("myabsences.unavailable") : t("myabsences.available")}</small>
            </button>
          ))}
        </div>
      </article>
      <article className="data-card">
        <div className="card-heading"><div><h3>{t("myabsences.myRequests")}</h3></div></div>
        {absences.map((a) => (
          <div key={a.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--line)", fontSize: 12 }}>
            <span>{absenceLabel(t, a.type)} · {a.startDate} – {a.endDate}</span>
            <em className={`status-pill ${a.status === "approved" ? "available" : a.status === "rejected" ? "away" : "transfer"}`}>{a.status === "approved" ? t("absences.approved") : a.status === "rejected" ? t("absences.rejected") : t("myabsences.statusPending")}</em>
          </div>
        ))}
        {absences.length === 0 && <p className="empty-state">{t("myabsences.none")}</p>}
      </article>

      {requesting && (
        <div className="modal-backdrop" onMouseDown={() => setRequesting(false)}>
          <section className="ai-modal account-modal" onMouseDown={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setRequesting(false)} aria-label={t("common.close")}><X size={18} /></button>
            <div className="modal-orb"><CalendarX2 size={22} /></div>
            <span className="modal-kicker">{t("myabsences.newRequestKicker")}</span><h2>{t("myabsences.requestAbsence")}</h2>
            <div className="transfer-form">
              <label><span>{t("myabsences.type")}</span><select value={type} onChange={(e) => setType(e.target.value)}><option value="vacation">{t("absence.vacation")}</option><option value="sick">{t("absence.sick")}</option><option value="unavailable">{t("absence.unavailable")}</option></select></label>
              <div className="date-fields"><label><span>{t("myabsences.from")}</span><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label><label><span>{t("myabsences.to")}</span><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label></div>
              <label><span>{t("myabsences.noteOptional")}</span><input value={note} onChange={(e) => setNote(e.target.value)} /></label>
            </div>
            <button className="primary-button modal-action" onClick={() => { onRequest(type, startDate, endDate, note); setRequesting(false); }}><Check size={16} /> {t("myabsences.submit")}</button>
          </section>
        </div>
      )}
    </div>
  );
}

/* ---------------- Coverage center ---------------- */
// A purpose-built coverage queue rather than a chat feed (master prompt
// 11.4: "replace fake-chat aesthetics with a purpose-built coverage
// center... separate open requests, my invitations, accepted/closed and
// escalated cases"). One request row (CoverageRow) is reused across the
// three sections below instead of rendering everything as a flat list.
function CoverageRow({ request, employeeName, locationName, showAccept, onAccept }: {
  request: CoverageRequestT; employeeName: (id: string) => string; locationName: (id?: string) => string;
  showAccept: boolean; onAccept: (id: string) => void;
}) {
  const { t } = useLanguage();
  const invitedCount = request.candidates.filter((c) => c.status === "invited").length;
  return (
    <article className="candidate-message">
      <span className={`avatar ${request.status === "closed" ? "green" : "orange"}`}>{request.status === "closed" ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}</span>
      <div>
        <strong>{request.shift ? `${locationName(request.shift.locationId)} · ${request.shift.date}` : t("chat.shift")}</strong>
        <span>{request.shift ? `${request.shift.startTime}–${request.shift.endTime}` : ""} · {request.reason}</span>
        <p>{request.status === "closed" ? t("chat.coveredBy", { name: employeeName(request.acceptedByUserId ?? "") }) : t("chat.invited", { count: invitedCount })}</p>
      </div>
      {showAccept ? (
        <button onClick={() => onAccept(request.id)}>{t("chat.acceptShift")}</button>
      ) : (
        // Settled state is plain status text, not a disabled button — a
        // greyed-out but still-rendered Accept control reads as a stale
        // action the person might still be able to press.
        <span className="status-pill transfer">{request.status === "closed" ? t("chat.closed") : t("chat.awaitingResponse")}</span>
      )}
    </article>
  );
}

export function ChatView({ coverage, employees, locations, currentUser, openShifts, onOpenCoverage, onAccept }: {
  coverage: CoverageRequestT[]; employees: EmployeeT[]; locations: LocationT[]; currentUser: CurrentUser;
  openShifts: ShiftT[]; onOpenCoverage: (shiftId: string) => void; onAccept: (id: string) => void;
}) {
  const { t } = useLanguage();
  const employeeName = (id: string) => employees.find((e) => e.id === id)?.name ?? "—";
  const locationName = (id?: string) => locations.find((l) => l.id === id)?.name ?? "—";
  const isEmployee = currentUser.role === "employee";
  const scoped = isEmployee ? coverage.filter((c) => c.candidates.some((cand) => cand.userId === currentUser.id)) : coverage;
  const open = scoped.filter((c) => c.status === "open");
  const myOpenInvites = open.filter((c) => c.candidates.some((cand) => cand.userId === currentUser.id && cand.status === "invited"));
  const closed = scoped.filter((c) => c.status === "closed");

  return (
    <div className="view-stack">
      <div className="view-heading"><div><span className="view-kicker">{t("chat.kicker")}</span><h2>{t("chat.title")}</h2><p>{t("chat.subtitle")}</p></div><span className="live-pill"><i /> {t("chat.automationActive")}</span></div>

      {currentUser.role !== "employee" && (
        <article className="data-card" style={{ marginBottom: 6 }}>
          <div className="card-heading"><div><h3>{t("chat.openShifts")}</h3><p>{t("chat.openShiftsSubtitle")}</p></div></div>
          {openShifts.length === 0 ? <p className="empty-state">{t("chat.noOpenShifts")}</p> : openShifts.map((shift) => (
            <div className="transfer-route-row" key={shift.id}>
              <div className="person-summary"><span><strong>{locationName(shift.locationId)}</strong><small>{shift.date} · {shift.startTime}–{shift.endTime}</small></span></div>
              <button className="row-action" onClick={() => onOpenCoverage(shift.id)}><Send size={13} /> {t("chat.requestCoverage")}</button>
            </div>
          ))}
        </article>
      )}

      {isEmployee && (
        <article className="data-card">
          <div className="card-heading"><div><h3>{t("chat.myInvitations")}</h3><p>{t("chat.myInvitationsSubtitle")}</p></div><span>{myOpenInvites.length}</span></div>
          <div className="candidate-list">
            {myOpenInvites.map((request) => <CoverageRow key={request.id} request={request} employeeName={employeeName} locationName={locationName} showAccept onAccept={onAccept} />)}
            {myOpenInvites.length === 0 && <p className="empty-state">{t("chat.noInvitations")}</p>}
          </div>
        </article>
      )}

      <article className="data-card">
        <div className="card-heading"><div><h3>{t("chat.openRequests")}</h3><p>{t("chat.openRequestsSubtitle")}</p></div><span>{open.length}</span></div>
        <div className="candidate-list">
          {(isEmployee ? open.filter((c) => !myOpenInvites.includes(c)) : open).map((request) => (
            <CoverageRow key={request.id} request={request} employeeName={employeeName} locationName={locationName}
              showAccept={!isEmployee ? false : request.candidates.some((c) => c.userId === currentUser.id && c.status === "invited")} onAccept={onAccept} />
          ))}
          {open.length === 0 && <p className="empty-state">{t("chat.noOpenRequests")}</p>}
        </div>
      </article>

      <article className="data-card">
        <div className="card-heading"><div><h3>{t("chat.resolved")}</h3><p>{t("chat.resolvedSubtitle")}</p></div><span>{closed.length}</span></div>
        <div className="candidate-list">
          {closed.slice(0, 10).map((request) => <CoverageRow key={request.id} request={request} employeeName={employeeName} locationName={locationName} showAccept={false} onAccept={onAccept} />)}
          {closed.length === 0 && <p className="empty-state">{t("chat.none")}</p>}
        </div>
      </article>
    </div>
  );
}

/* ---------------- Staff directory ---------------- */
export function StaffDirectoryView({ employees, locations }: { employees: EmployeeT[]; locations: LocationT[] }) {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const locationName = (id: string | null) => locations.find((l) => l.id === id)?.name ?? t("team.unassigned");
  const filtered = employees.filter((p) => `${p.name} ${p.occupation}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="view-stack">
      <div className="view-heading"><div><span className="view-kicker">{t("staff.kicker")}</span><h2>{t("staff.title")}</h2><p>{t("staff.subtitle")}</p></div><label className="directory-search"><Search size={15} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("staff.search")} /></label></div>
      <section className="directory-grid">
        {filtered.map((person) => (
          <article className="person-card" key={person.id}>
            <div className={`avatar profile-avatar ${person.color}`}>{initials(person.name)}</div>
            <div className="person-card-head"><div><h3>{person.name}</h3><span>{person.occupation}</span></div></div>
            <div className="person-contact"><span><Phone size={13} /> {person.phone || "—"}</span><span><Mail size={13} /> {person.email}</span><span><Building2 size={13} /> {locationName(person.currentLocationId)}</span></div>
          </article>
        ))}
        {filtered.length === 0 && <p className="empty-state">{t("staff.none")}</p>}
      </section>
    </div>
  );
}

/* ---------------- Locations ---------------- */
// Leaflet touches `window` at import time, so it's loaded dynamically inside
// the effect (never at module scope) — importing it eagerly would crash
// Next's server render. Tiles come from the public OpenStreetMap tile
// server and the marker icon assets from the unpkg CDN (Leaflet's default
// icon URLs are relative paths that don't resolve once bundled), so this
// needs network access but no API key.
function GeofenceMapPicker({ lat, lng, radius, onMove }: {
  lat: number; lng: number; radius: number; onMove: (lat: number, lng: number) => void;
}) {
  const { t } = useLanguage();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapObjRef = useRef<{ map: L.Map; marker: L.Marker; circle: L.Circle } | null>(null);
  const onMoveRef = useRef(onMove);
  useEffect(() => { onMoveRef.current = onMove; });
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const leaflet = await import("leaflet");
      const Lmod = leaflet.default;
      if (cancelled || !containerRef.current || mapObjRef.current) return;
      const start: [number, number] = [lat || 55.6761, lng || 12.5683];
      const map = Lmod.map(containerRef.current).setView(start, lat && lng ? 16 : 11);
      Lmod.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);
      const icon = Lmod.icon({
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
        iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
      });
      const marker = Lmod.marker(start, { draggable: true, icon }).addTo(map);
      const circle = Lmod.circle(start, { radius, color: "#1c3a5e", fillColor: "#1c3a5e", fillOpacity: 0.12 }).addTo(map);
      marker.on("drag", () => circle.setLatLng(marker.getLatLng()));
      marker.on("dragend", () => { const p = marker.getLatLng(); onMoveRef.current(p.lat, p.lng); });
      map.on("click", (e: L.LeafletMouseEvent) => {
        marker.setLatLng(e.latlng);
        circle.setLatLng(e.latlng);
        onMoveRef.current(e.latlng.lat, e.latlng.lng);
      });
      mapObjRef.current = { map, marker, circle };
    })();
    return () => {
      cancelled = true;
      if (mapObjRef.current) { mapObjRef.current.map.remove(); mapObjRef.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initialize once; lat/lng/radius are pushed in via the effects below instead of re-running this setup.
  }, []);

  // Re-center the pin when lat/lng change from outside the map (typing in
  // the numeric fields, or "use my location" below) without rebuilding it.
  useEffect(() => {
    if (!mapObjRef.current || !lat || !lng) return;
    const pos: [number, number] = [lat, lng];
    mapObjRef.current.marker.setLatLng(pos);
    mapObjRef.current.circle.setLatLng(pos);
    mapObjRef.current.map.setView(pos, mapObjRef.current.map.getZoom() < 14 ? 16 : mapObjRef.current.map.getZoom());
  }, [lat, lng]);

  useEffect(() => { mapObjRef.current?.circle.setRadius(radius); }, [radius]);

  const useMyLocation = async () => {
    setLocating(true);
    try {
      const permissions = await Geolocation.requestPermissions();
      if (permissions.location === "denied") return;
      const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 });
      onMove(position.coords.latitude, position.coords.longitude);
    } catch {
      // Silently ignored — this is a convenience shortcut; the manager can
      // still drag the pin or type coordinates directly.
    } finally { setLocating(false); }
  };

  return (
    <div className="geofence-map-wrap">
      <div ref={containerRef} className="geofence-map" />
      <button type="button" className="secondary-button geofence-locate" onClick={useMyLocation} disabled={locating}>
        <MapPin size={14} /> {locating ? t("time.locating") : t("locations.useMyLocation")}
      </button>
    </div>
  );
}

export function LocationsView({ locations, employees, currentUser, onCreate, onOpenStaff, onVerify }: {
  locations: LocationT[]; employees: EmployeeT[]; currentUser: CurrentUser;
  onCreate: (name: string) => void; onOpenStaff: () => void;
  onVerify: (id: string, latitude: number, longitude: number, radiusMeters: number) => void;
}) {
  const { t, locale } = useLanguage();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [verifying, setVerifying] = useState<LocationT | null>(null);
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [radius, setRadius] = useState("50");
  const canManage = currentUser.role === "owner" || currentUser.role === "manager";

  const openVerify = (site: LocationT) => {
    setVerifying(site);
    setLat(String(site.latitude));
    setLng(String(site.longitude));
    setRadius(String(site.radiusMeters));
  };

  return (
    <div className="view-stack">
      <div className="view-heading"><div><span className="view-kicker">{t("locations.kicker")}</span><h2>{t("locations.count", { count: locations.length })}</h2><p>{t("locations.subtitle")}</p></div>
        {currentUser.role !== "employee" && <button className="primary-button" onClick={() => setCreating(true)}><Store size={16} /> {t("locations.new")}</button>}
      </div>
      <section className="locations-grid">
        {locations.map((site) => {
          const staff = employees.filter((e) => (e.currentLocationId ?? e.homeLocationId) === site.id);
          return (
            <article className="location-card" key={site.id}>
              <div className="location-card-head"><span><Store size={20} /></span><div><h3>{site.name}</h3><p>{site.address || t("locations.noAddress")}</p></div></div>
              <div className="location-hours"><Clock3 size={14} /> {site.openHours}<em>{t("locations.peopleCount", { count: staff.length })}</em></div>
              <div className={`geofence-monitor ${site.verified ? "safe" : "warning"}`} style={{ margin: "11px 0" }}>
                {site.verified ? <ShieldCheck size={16} /> : <AlertTriangle size={16} />}
                <div><strong>{site.verified ? t("locations.verified") : t("locations.unverified")}</strong><span>{site.verified ? t("locations.radiusNote", { radius: site.radiusMeters }) : t("locations.unverifiedNote")}</span></div>
              </div>
              {canManage && site.budgetCents !== undefined && (
                <p style={{ margin: "0 0 11px", color: "var(--muted)", fontSize: 12.5 }}>{t("locations.weeklyBudget")}: <strong style={{ color: "var(--ink)" }}>{site.budgetCents > 0 ? money(site.budgetCents, locale) : t("locations.noBudgetSet")}</strong></p>
              )}
              <div className="onsite-list">{staff.length ? staff.map((person) => <div key={person.id}><span className={`avatar ${person.color}`}>{initials(person.name)}</span><span><strong>{person.name}</strong><small>{person.occupation}</small></span></div>) : <p>{t("locations.noStaff")}</p>}</div>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button className="secondary-button" onClick={onOpenStaff} style={{ flex: 1 }}>{t("locations.viewTeam")} <ArrowUpRight size={14} /></button>
                {canManage && <button className="secondary-button" onClick={() => openVerify(site)} style={{ flex: 1 }}><MapPin size={14} /> {t("locations.setCoordinates")}</button>}
              </div>
            </article>
          );
        })}
        {locations.length === 0 && <p className="empty-state">{t("locations.none")}</p>}
      </section>

      {creating && (
        <div className="modal-backdrop" onMouseDown={() => setCreating(false)}>
          <section className="ai-modal account-modal" onMouseDown={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setCreating(false)} aria-label={t("common.close")}><X size={18} /></button>
            <div className="modal-orb"><Store size={22} /></div><span className="modal-kicker">{t("locations.createKicker")}</span><h2>{t("locations.create")}</h2>
            <div className="transfer-form"><label><span>{t("locations.name")}</span><input value={name} onChange={(e) => setName(e.target.value)} /></label></div>
            <div className="modal-account-actions"><button className="secondary-button" onClick={() => setCreating(false)}>{t("locations.cancel")}</button><button className="primary-button" disabled={!name.trim()} onClick={() => { onCreate(name.trim()); setCreating(false); setName(""); }}>{t("locations.create")}</button></div>
          </section>
        </div>
      )}

      {verifying && (
        <div className="modal-backdrop" onMouseDown={() => setVerifying(null)}>
          <section className="ai-modal account-modal" onMouseDown={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setVerifying(null)} aria-label={t("common.close")}><X size={18} /></button>
            <div className="modal-orb"><MapPin size={22} /></div><span className="modal-kicker">{t("locations.geofenceKicker")}</span><h2>{verifying.name}</h2>
            <p>{t("locations.geofenceBody")}</p>
            <GeofenceMapPicker
              lat={Number(lat) || 0} lng={Number(lng) || 0} radius={Number(radius) || 50}
              onMove={(newLat, newLng) => { setLat(newLat.toFixed(6)); setLng(newLng.toFixed(6)); }}
            />
            <div className="transfer-form">
              <div className="date-fields">
                <label><span>{t("locations.latitude")}</span><input value={lat} onChange={(e) => setLat(e.target.value)} inputMode="decimal" /></label>
                <label><span>{t("locations.longitude")}</span><input value={lng} onChange={(e) => setLng(e.target.value)} inputMode="decimal" /></label>
              </div>
              <label><span>{t("locations.radius")}</span><input value={radius} onChange={(e) => setRadius(e.target.value)} inputMode="numeric" /></label>
            </div>
            <div className="modal-account-actions">
              <button className="secondary-button" onClick={() => setVerifying(null)}>{t("locations.cancel")}</button>
              <button className="primary-button" disabled={!lat.trim() || !lng.trim() || !radius.trim()} onClick={() => { onVerify(verifying.id, Number(lat), Number(lng), Number(radius)); setVerifying(null); }}><ShieldCheck size={15} /> {t("locations.confirmGeofence")}</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

/* ---------------- Accounts ---------------- */
export function AccountsView({ employees, locations, currentUser, onCreate, onDelete }: {
  employees: EmployeeT[]; locations: LocationT[]; currentUser: CurrentUser;
  onCreate: (payload: { name: string; email: string; role: string; locationId: string }) => Promise<{ temporaryPassword: string | null; emailed: boolean } | null>;
  onDelete: (id: string) => void;
}) {
  const { t } = useLanguage();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("employee");
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [result, setResult] = useState<{ temporaryPassword: string | null; emailed: boolean } | null>(null);

  return (
    <div className="view-stack">
      <div className="view-heading"><div><span className="view-kicker">{t("accounts.kicker")}</span><h2>{t("accounts.title")}</h2><p>{t("accounts.subtitle")}</p></div><button className="primary-button" onClick={() => { setCreating(true); setResult(null); }}><UserPlus size={16} /> {t("accounts.create")}</button></div>
      <article className="data-card accounts-card">
        <div className="account-row table-head"><span>{t("accounts.colUser")}</span><span>{t("accounts.colAccess")}</span><span>{t("accounts.colLocation")}</span><span /></div>
        {employees.map((account) => {
          const protectedOwner = currentUser.role === "manager" && account.role === "owner";
          const isSelf = account.id === currentUser.id;
          return (
            <div className="account-row table-row" key={account.id}>
              <span className="person-summary"><span className={`avatar ${account.color}`}>{initials(account.name)}</span><span><strong>{account.name}</strong><small>{account.email}</small></span></span>
              <em className={`access-pill ${account.role}`}>{account.role === "owner" ? <Crown size={12} /> : account.role === "manager" ? <ShieldCheck size={12} /> : <UserCheck size={12} />}{t(`role.${account.role}`)}</em>
              <span>{locations.find((l) => l.id === account.currentLocationId)?.name ?? "—"}</span>
              <span><button className="delete-account" disabled={protectedOwner || isSelf} aria-label={protectedOwner ? t("accounts.deleteProtected") : isSelf ? t("accounts.deleteSelf") : t("accounts.delete")} title={protectedOwner ? t("accounts.deleteProtected") : isSelf ? t("accounts.deleteSelf") : t("accounts.delete")} onClick={() => onDelete(account.id)}>{protectedOwner || isSelf ? <LockKeyhole size={15} /> : <Trash2 size={15} />}</button></span>
            </div>
          );
        })}
      </article>

      {creating && (
        <div className="modal-backdrop" onMouseDown={() => setCreating(false)}>
          <section className="ai-modal account-modal" onMouseDown={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setCreating(false)} aria-label={t("common.close")}><X size={18} /></button>
            <div className="modal-orb"><UserPlus size={25} /></div><span className="modal-kicker">{t("accounts.createKicker")}</span><h2>{t("accounts.createTitle")}</h2>
            {!result ? (
              <>
                <div className="transfer-form">
                  <label><span>{t("accounts.fullName")}</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
                  <label><span>{t("accounts.email")}</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
                  <label><span>{t("accounts.access")}</span><select value={role} onChange={(e) => setRole(e.target.value)}><option value="employee">{t("role.employee")}</option><option value="manager">{t("role.manager")}</option>{currentUser.role === "owner" && <option value="owner">{t("role.owner")}</option>}</select></label>
                  <p style={{ margin: "-6px 0 0", color: "var(--muted)", fontSize: 11.5, textAlign: "left" }}>{t(`accounts.roleExplain.${role}`)}</p>
                  <label><span>{t("accounts.location")}</span><select value={locationId} onChange={(e) => setLocationId(e.target.value)}>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
                </div>
                <div className="modal-account-actions">
                  <button className="secondary-button" onClick={() => setCreating(false)}>{t("accounts.cancel")}</button>
                  <button className="primary-button" disabled={!name.trim() || !email.trim()} onClick={async () => { const res = await onCreate({ name, email, role, locationId }); if (res) { setResult(res); setName(""); setEmail(""); } }}>{t("accounts.createUser")}</button>
                </div>
              </>
            ) : (
              <>
                <p>{result.emailed ? t("accounts.createdEmailedTitle", { email }) : t("accounts.createdTitle")}</p>
                {result.temporaryPassword && !result.emailed && <div className="temp-password-box"><span>{t("accounts.tempPassword")}</span><code>{result.temporaryPassword}</code></div>}
                <button className="primary-button modal-action" onClick={() => setCreating(false)}>{t("accounts.done")}</button>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

/* ---------------- Settings ---------------- */
export function SettingsView({ permissions, onToggle, organization, locations, onUpdateOrgLogo, onUpdateLocationLogo }: {
  permissions: PermissionsT; onToggle: (key: keyof PermissionsT) => void;
  organization: OrgT | null; locations: LocationT[];
  onUpdateOrgLogo: (logoUrl: string | null) => void;
  onUpdateLocationLogo: (locationId: string, logoUrl: string | null) => void;
}) {
  const { t, lang, setLang } = useLanguage();
  const [logoError, setLogoError] = useState<string | null>(null);
  const rows: [keyof PermissionsT, string, string][] = [
    ["approveLeave", t("settings.approveLeave"), t("settings.managersOwners")],
    ["moveEmployees", t("settings.moveEmployees"), t("settings.managersOwners")],
    ["editPublished", t("settings.editPublished"), t("settings.managersOwners")],
    ["overrideAI", t("settings.overrideAI"), t("settings.ownersOnly")],
  ];

  const handleUpload = async (file: File, save: (dataUrl: string) => Promise<void> | void) => {
    try {
      const dataUrl = await fileToLogoDataUrl(file);
      await save(dataUrl);
      setLogoError(null);
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : t("settings.logoUploadError"));
    }
  };

  return (
    <div className="view-stack">
      <div className="view-heading"><div><span className="view-kicker">{t("settings.kicker")}</span><h2>{t("settings.title")}</h2><p>{t("settings.subtitle")}</p></div></div>

      <h3 className="settings-section-title">{t("settings.section.permissions")}</h3>
      <section className="data-card permission-card">
        {rows.map(([key, label, detail]) => (
          <div className="permission-row" key={key}><div><strong>{label}</strong><span>{detail}</span></div><button className={`toggle ${permissions[key] ? "on" : ""}`} onClick={() => onToggle(key)} aria-label={label}><i /></button></div>
        ))}
      </section>

      <h3 className="settings-section-title">{t("settings.section.languageRegion")}</h3>
      <article className="data-card permission-card">
        <div className="permission-row">
          <div><strong>{t("settings.languageTitle")}</strong><span>{t("settings.languageSubtitle")}</span></div>
          <div style={{ display: "flex", gap: 6 }}>
            {LANGUAGES.map((option) => (
              <button key={option.code} className={option.code === lang ? "secondary-button" : "row-action"} onClick={() => setLang(option.code)}>{option.label}</button>
            ))}
          </div>
        </div>
      </article>

      {organization && locations && onUpdateOrgLogo && onUpdateLocationLogo && (
        <>
        <h3 className="settings-section-title">{t("settings.section.branding")}</h3>
        <article className="data-card permission-card branding-card">
          <div className="permission-row"><div><strong>{t("settings.brandingTitle")}</strong><span>{t("settings.brandingSubtitle")}</span></div></div>

          <div className="logo-uploader-row">
            <div className="logo-preview">{organization.logoUrl ? <img src={organization.logoUrl} alt="" /> : <ImageIcon size={18} />}</div>
            <div className="logo-uploader-actions">
              <strong>{t("settings.companyLogo")}</strong>
              <div>
                <label className="secondary-button logo-upload-btn">
                  {t("settings.uploadLogo")}
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f, (url) => onUpdateOrgLogo(url)); e.target.value = ""; }} />
                </label>
                {organization.logoUrl && <button className="row-action" onClick={() => onUpdateOrgLogo(null)}>{t("settings.removeLogo")}</button>}
              </div>
            </div>
          </div>

          {locations.map((site) => (
            <div className="logo-uploader-row" key={site.id}>
              <div className="logo-preview">{site.logoUrl ? <img src={site.logoUrl} alt="" /> : <Store size={18} />}</div>
              <div className="logo-uploader-actions">
                <strong>{site.name}</strong>
                <div>
                  <label className="secondary-button logo-upload-btn">
                    {t("settings.uploadLogo")}
                    <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f, (url) => onUpdateLocationLogo(site.id, url)); e.target.value = ""; }} />
                  </label>
                  {site.logoUrl && <button className="row-action" onClick={() => onUpdateLocationLogo(site.id, null)}>{t("settings.removeLogo")}</button>}
                </div>
              </div>
            </div>
          ))}
          {logoError && <p className="logo-upload-error"><AlertTriangle size={13} /> {logoError}</p>}
        </article>
        </>
      )}

      <h3 className="settings-section-title">{t("settings.section.security")}</h3>
      <article className="data-card permission-card">
        <div className="permission-row"><div><strong>{t("settings.passwordTitle")}</strong><span>{t("settings.passwordSubtitle")}</span></div><a className="secondary-button" href="/forgot-password"><LockKeyhole size={14} /> {t("settings.changePassword")}</a></div>
      </article>

      <h3 className="settings-section-title">{t("settings.section.dataPrivacy")}</h3>
      <article className="data-card permission-card">
        <div className="permission-row"><div><strong>{t("settings.dataTitle")}</strong><span>{t("settings.dataSubtitle")}</span></div></div>
      </article>
    </div>
  );
}

/* ---------------- Billing ---------------- */
export function BillingView({ employees, locations, onError }: { employees: EmployeeT[]; locations: LocationT[]; onError: (error: unknown) => void }) {
  const { t, locale } = useLanguage();
  const [billing, setBilling] = useState<BillingT | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    apiFetch("/api/billing").then((r) => r.json()).then((data) => { setBilling(data); setLoaded(true); }).catch((e) => { onError(e); setLoaded(true); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!loaded) return <div className="empty-state">{t("common.loading")}</div>;
  if (!billing) return <div className="empty-state">{t("billing.loadError")}</div>;

  const seatsUsed = employees.length;
  const locationsUsed = locations.length;
  const trialDaysLeft = Math.max(0, Math.ceil((new Date(billing.trialEndsAt).getTime() - new Date().getTime()) / (24 * 60 * 60 * 1000)));

  const statusLabel = billing.isRestricted
    ? t("billing.status.restricted")
    : billing.subscriptionStatus === "trialing"
      ? t("billing.status.trialing", { count: trialDaysLeft })
      : billing.subscriptionStatus === "active"
        ? t("billing.status.active")
        : billing.subscriptionStatus;

  return (
    <div className="view-stack">
      <div className="view-heading"><div><span className="view-kicker">{t("billing.kicker")}</span><h2>{billing.plan.name}</h2><p>{statusLabel}</p></div></div>

      {billing.isRestricted && (
        <div className="banner-error"><AlertTriangle size={16} /> {t("billing.restrictedNotice")}</div>
      )}

      <section className="transfer-summary-grid">
        <article><span className="summary-icon violet"><UsersRound size={18} /></span><div><small>{t("billing.seats")}</small><strong>{seatsUsed} / {billing.seatLimit}</strong><p>{t("billing.seatsDetail")}</p></div></article>
        <article><span className="summary-icon green"><Store size={18} /></span><div><small>{t("billing.locations")}</small><strong>{locationsUsed} / {billing.locationLimit}</strong><p>{t("billing.locationsDetail")}</p></div></article>
        <article><span className="summary-icon orange"><CreditCard size={18} /></span><div><small>{t("billing.price")}</small><strong>{billing.plan.priceMonthlyCents == null ? t("billing.notPriced") : money(billing.plan.priceMonthlyCents, locale)}</strong><p>{billing.plan.positioning}</p></div></article>
      </section>

      <article className="data-card">
        <div className="card-heading"><div><h3>{t("billing.plans")}</h3><p>{t("billing.plansSubtitle")}</p></div></div>
        {billing.catalog.map((plan) => (
          <div className="permission-row" key={plan.key}>
            <div><strong>{plan.name}{plan.key === billing.planKey && <em className="status-pill available" style={{ marginLeft: 8 }}>{t("billing.currentPlan")}</em>}</strong><span>{plan.positioning}</span></div>
            <span>{t("billing.limitsSummary", { seats: plan.seatLimit >= 9999 ? "∞" : String(plan.seatLimit), locations: plan.locationLimit >= 9999 ? "∞" : String(plan.locationLimit) })}</span>
          </div>
        ))}
      </article>

      <p className="preview-note">{t("billing.notConnectedNote")}</p>
    </div>
  );
}

/* ---------------- Audit log ---------------- */
function auditActionLabel(t: (key: string) => string, action: string) {
  const key = `audit.action.${action}`;
  const translated = t(key);
  return translated === key ? action : translated;
}

export function AuditLogView({ employees, onError }: { employees: EmployeeT[]; onError: (error: unknown) => void }) {
  const { t, locale } = useLanguage();
  const [events, setEvents] = useState<AuditEventT[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    apiFetch("/api/audit").then((r) => r.json()).then((data) => { setEvents(data.events ?? []); setLoaded(true); }).catch((e) => { onError(e); setLoaded(true); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadMore = async () => {
    const oldest = events[events.length - 1];
    if (!oldest) return;
    setLoadingMore(true);
    try {
      const res = await apiFetch(`/api/audit?before=${encodeURIComponent(oldest.createdAt.slice(0, 10))}`);
      const data = await res.json();
      setEvents((prev) => [...prev, ...(data.events ?? [])]);
    } catch (e) {
      onError(e);
    } finally {
      setLoadingMore(false);
    }
  };

  const filtered = events.filter((e) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return e.actorName.toLowerCase().includes(q) || e.action.toLowerCase().includes(q) || e.entityType.toLowerCase().includes(q);
  });

  return (
    <div className="view-stack">
      <div className="view-heading"><div><span className="view-kicker">{t("audit.kicker")}</span><h2>{t("audit.title")}</h2><p>{t("audit.subtitle")}</p></div></div>

      <div className="directory-search" style={{ width: "100%", maxWidth: 340 }}>
        <Search size={15} /><input placeholder={t("audit.searchPlaceholder")} value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <article className="data-card">
        {!loaded ? (
          <div className="empty-state">{t("common.loading")}</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">{t("audit.empty")}</div>
        ) : (
          <div className="timeline-list">
            {filtered.map((event) => {
              const actor = employees.find((e) => e.id === event.actorUserId);
              return (
                <div className="timeline-step active" key={event.id}>
                  <i><History size={12} /></i>
                  <div>
                    <strong>{(actor?.name ?? event.actorName) || t("audit.systemActor")} · {auditActionLabel(t, event.action)}</strong>
                    <small title={event.createdAt}>{event.entityType} {event.entityId ? `· ${event.entityId.slice(0, 10)}` : ""} · {new Date(event.createdAt).toLocaleString(locale)}</small>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </article>
      {events.length > 0 && events.length % 100 === 0 && (
        <button className="secondary-button" disabled={loadingMore} onClick={loadMore}>{loadingMore ? t("common.loading") : t("audit.loadMore")}</button>
      )}
    </div>
  );
}

/* ---------------- Transfer modal ---------------- */
export function TransferModal({ employee, locations, onClose, onConfirm }: {
  employee: EmployeeT; locations: LocationT[]; onClose: () => void;
  onConfirm: (toLocationId: string, type: string, startDate: string) => void;
}) {
  const { t } = useLanguage();
  const [toLocationId, setToLocationId] = useState(locations.find((l) => l.id !== employee.currentLocationId)?.id ?? locations[0]?.id ?? "");
  const [type, setType] = useState("temporary");
  const [startDate, setStartDate] = useState(todayISO());
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="ai-modal transfer-modal" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label={t("transferModal.close")}><X size={18} /></button>
        <div className="modal-orb transfer-orb"><ArrowLeftRight size={25} /></div>
        <span className="modal-kicker">{t("transferModal.kicker")}</span>
        <h2>{t("transferModal.title", { name: employee.name })}</h2>
        <p>{t("transferModal.body")}</p>
        <div className="transfer-form">
          <label><span>{t("transferModal.type")}</span><select value={type} onChange={(e) => setType(e.target.value)}><option value="temporary">{t("transfers.temporary")}</option><option value="permanent">{t("transfers.permanent")}</option></select></label>
          <label><span>{t("transferModal.destination")}</span><select value={toLocationId} onChange={(e) => setToLocationId(e.target.value)}>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
          <div className="date-fields"><label><span>{t("transferModal.from")}</span><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label></div>
        </div>
        <button className="primary-button modal-action" onClick={() => onConfirm(toLocationId, type, startDate)} disabled={!toLocationId}><Check size={16} /> {t("transferModal.confirm")}</button>
      </section>
    </div>
  );
}
