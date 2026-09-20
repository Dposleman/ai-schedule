"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { BrandLogo } from "@/app/brand-logo";
import {
  AlertTriangle, ArrowLeftRight, ArrowUpRight, Bell, Banknote, Building2, CalendarDays,
  Check, ChevronDown, Clock3, ClipboardCheck, Fingerprint, History,
  LayoutDashboard, LoaderCircle, LogOut, MessageCircle,
  Moon, Settings2, ShieldCheck, Sparkles, Store, Sun, Umbrella,
  UserCheck, UsersRound, WandSparkles, X,
  type LucideIcon,
} from "lucide-react";
import { formatWeekRange, startOfWeek, toISODate, addDays, todayISO } from "@/lib/dates";
import { useLanguage } from "@/app/language-context";
import { LanguageSwitcher } from "@/app/language-switcher";
import {
  ResumenView, MyShiftView, PlannerView, TimeTrackingView, DailyOperationsView, CostsView,
  TeamView, TransfersView, MyAbsencesView, AbsencesView, ChatView, StaffDirectoryView,
  LocationsView, AccountsView, SettingsView, BillingView, AuditLogView, TransferModal,
} from "@/app/app-shell-views";
import type {
  CurrentUser, LocationT, OrgT, EmployeeT, ShiftT, AbsenceT, TransferT, TaskT,
  CoverageRequestT, PermissionsT, NotificationT, TodayAttendanceT,
} from "@/lib/view-types";

type NavKey =
  | "resumen" | "myshift" | "planner" | "timetracking" | "dailyops" | "costs" | "team"
  | "transfers" | "absences" | "chat" | "staff" | "locations" | "accounts" | "settings"
  | "billing" | "auditlog";

const AVATAR_COLORS = ["blue", "green", "orange", "pink", "lilac"];

const managementNavItems: { key: NavKey; labelKey: string; icon: LucideIcon }[] = [
  { key: "resumen", labelKey: "nav.resumen", icon: LayoutDashboard },
  { key: "planner", labelKey: "nav.planner", icon: CalendarDays },
  { key: "timetracking", labelKey: "nav.timetracking", icon: Fingerprint },
  { key: "dailyops", labelKey: "nav.dailyops", icon: ClipboardCheck },
  { key: "costs", labelKey: "nav.costs", icon: Banknote },
  { key: "team", labelKey: "nav.team", icon: UsersRound },
  { key: "transfers", labelKey: "nav.transfers", icon: ArrowLeftRight },
  { key: "absences", labelKey: "nav.absences", icon: Umbrella },
  { key: "chat", labelKey: "nav.chat", icon: MessageCircle },
  { key: "staff", labelKey: "nav.staff", icon: UserCheck },
  { key: "locations", labelKey: "nav.locations", icon: Store },
  { key: "accounts", labelKey: "nav.accounts", icon: ShieldCheck },
];

const employeeNavItems: { key: NavKey; labelKey: string; icon: LucideIcon }[] = [
  { key: "myshift", labelKey: "nav.myshift", icon: CalendarDays },
  { key: "timetracking", labelKey: "nav.timetracking", icon: Fingerprint },
  { key: "staff", labelKey: "nav.staff", icon: UserCheck },
  { key: "locations", labelKey: "nav.locations", icon: Store },
  { key: "absences", labelKey: "nav.absences", icon: Umbrella },
  { key: "chat", labelKey: "nav.chat", icon: MessageCircle },
];

function timeAgo(iso: string, locale: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short" });
}

function initials(name: string) {
  return name.split(" ").filter(Boolean).map((part) => part[0]).slice(0, 2).join("").toUpperCase();
}

async function api<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(url, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data as T;
}

export default function AppShell({
  currentUser,
  onLoggedOut,
}: {
  currentUser: CurrentUser;
  /** Mobile has no Next.js router to redirect to /login with, so it supplies its own. */
  onLoggedOut?: () => void;
}) {
  const { lang, t, locale, setLang } = useLanguage();
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [location, setLocation] = useState("all");
  const [locationOpen, setLocationOpen] = useState(false);
  const [activeNav, setActiveNav] = useState<NavKey>(currentUser.role === "employee" ? "myshift" : "resumen");
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);

  const [organization, setOrganization] = useState<OrgT | null>(null);
  const [locations, setLocations] = useState<LocationT[]>([]);
  const [employees, setEmployees] = useState<EmployeeT[]>([]);
  const [shifts, setShifts] = useState<ShiftT[]>([]);
  const [absences, setAbsences] = useState<AbsenceT[]>([]);
  const [unavailableDays, setUnavailableDays] = useState<string[]>([]);
  const [transfers, setTransfers] = useState<TransferT[]>([]);
  const [tasks, setTasks] = useState<TaskT[]>([]);
  const [coverage, setCoverage] = useState<CoverageRequestT[]>([]);
  const [permissions, setPermissions] = useState<PermissionsT | null>(null);
  const [attendanceToday, setAttendanceToday] = useState<TodayAttendanceT[]>([]);

  const [weekStart, setWeekStart] = useState(() => toISODate(startOfWeek()));
  const weekEnd = useMemo(() => toISODate(addDays(new Date(`${weekStart}T00:00:00`), 6)), [weekStart]);

  const [notifications, setNotifications] = useState<NotificationT[]>([]);
  const [notifUnread, setNotifUnread] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);

  const [aiModal, setAiModal] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateResult, setGenerateResult] = useState<{ created: number; open: number; coverage: number } | null>(null);
  const [generationScope, setGenerationScope] = useState<"week" | "pay-period">("week");
  const [transferTarget, setTransferTarget] = useState<EmployeeT | null>(null);

  const fail = (error: unknown) => setBanner(error instanceof Error ? error.message : t("common.somethingWrong"));

  // Sync the account's saved language into the UI once, without re-triggering a PATCH.
  useEffect(() => {
    if (currentUser.language && currentUser.language !== lang) setLang(currentUser.language, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadAll = useCallback(async () => {
    try {
      const [org, loc, emp, shf, abs, unavail, trf, tsk, cov, perm, attToday] = await Promise.all([
        api<{ organization: OrgT }>("/api/organization"),
        api<{ locations: LocationT[] }>("/api/locations"),
        api<{ employees: EmployeeT[] }>("/api/employees"),
        api<{ shifts: ShiftT[] }>(`/api/shifts?from=${weekStart}&to=${weekEnd}`),
        api<{ absences: AbsenceT[] }>("/api/absences"),
        api<{ dates: string[] }>("/api/unavailability"),
        api<{ transfers: TransferT[] }>("/api/transfers"),
        api<{ tasks: TaskT[] }>(`/api/tasks?date=${todayISO()}`),
        api<{ requests: CoverageRequestT[] }>("/api/coverage"),
        api<{ permissions: PermissionsT | null }>("/api/permissions"),
        api<{ attendance: TodayAttendanceT[] }>("/api/attendance/today"),
      ]);
      setOrganization(org.organization);
      setLocations(loc.locations);
      setEmployees(emp.employees);
      setShifts(shf.shifts);
      setAbsences(abs.absences);
      setUnavailableDays(unavail.dates);
      setTransfers(trf.transfers);
      setTasks(tsk.tasks);
      setCoverage(cov.requests);
      setPermissions(perm.permissions);
      setAttendanceToday(attToday.attendance);
    } catch (error) {
      fail(error);
    } finally {
      setLoading(false);
    }
  }, [weekStart, weekEnd]);

  // Data fetch on mount/dependency change, not derived-state-from-props —
  // the setState calls happen inside loadAll() after an await, in response
  // to the API result, which is exactly what effects are for.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadAll(); }, [loadAll]);

  const loadNotifications = useCallback(async () => {
    try {
      const data = await api<{ notifications: NotificationT[]; unread: number }>("/api/notifications");
      setNotifications(data.notifications);
      setNotifUnread(data.unread);
    } catch {
      // Silent — the bell just won't update this tick.
    }
  }, []);

  // Same as loadAll() above: this polls the notifications endpoint, and the
  // setState calls happen inside the async loadNotifications() body — a
  // subscribe-to-an-external-system effect, not synchronous derived state.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadNotifications();
    const interval = setInterval(loadNotifications, 30000);
    return () => clearInterval(interval);
  }, [loadNotifications]);

  const toggleNotifications = async () => {
    const next = !notifOpen;
    setNotifOpen(next);
    if (next && notifUnread > 0) {
      try {
        await api("/api/notifications", { method: "POST" });
        setNotifUnread(0);
        setNotifications((rows) => rows.map((row) => ({ ...row, readAt: row.readAt ?? new Date().toISOString() })));
      } catch {
        // Non-critical — the dot can stay lit until the next poll.
      }
    }
  };

  // Reads localStorage/matchMedia, which don't exist during SSR, so the
  // theme can't be known until after mount — rendering "light" first on
  // both server and client, then correcting it here, is what keeps the
  // initial client render matching the server HTML instead of triggering a
  // hydration mismatch.
  useEffect(() => {
    const savedTheme = (localStorage.getItem("ai-schedule-theme") as "light" | "dark" | null) ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(savedTheme);
    document.documentElement.dataset.theme = savedTheme;
  }, []);

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem("ai-schedule-theme", next);
    document.documentElement.dataset.theme = next;
  };

  const logout = async () => {
    await apiFetch("/api/auth/logout", { method: "POST" });
    if (onLoggedOut) onLoggedOut();
    else if (typeof window !== "undefined") window.location.href = "/login";
  };

  const availableNav = currentUser.role === "employee" ? employeeNavItems : managementNavItems;
  const selectedLocation = useMemo(() => locations.find((item) => item.id === location) ?? null, [location, locations]);
  const locationEmployees = useMemo(
    () => employees.filter((employee) => location === "all" || (employee.currentLocationId ?? employee.homeLocationId) === location),
    [employees, location]
  );

  const generateSchedule = async () => {
    setGenerating(true);
    try {
      const result = await api<{ created: number; open: number; coverage: number }>("/api/shifts/generate", {
        method: "POST",
        body: JSON.stringify({ weekStart, locationIds: location === "all" ? undefined : [location], scope: generationScope }),
      });
      setGenerateResult(result);
      await loadAll();
    } catch (error) { fail(error); } finally { setGenerating(false); }
  };

  const publishWeek = async () => {
    try {
      await api("/api/shifts/publish", { method: "POST", body: JSON.stringify({ weekStart, weekEnd }) });
      await loadAll();
    } catch (error) { fail(error); }
  };

  const currentUserToday = shifts.find((shift) => shift.userId === currentUser.id && shift.date === todayISO() && shift.published === 1);

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><BrandLogo variant="sidebar" /></div>

        <div className="location-picker">
          <button className="location-trigger" onClick={() => setLocationOpen((v) => !v)} aria-expanded={locationOpen} aria-label={t("shell.changeLocation")}>
            <span className="location-symbol">{selectedLocation?.logoUrl ? <img src={selectedLocation.logoUrl} alt="" /> : <Building2 size={17} />}</span>
            <span className="location-copy"><small>{t("shell.yourOrg")}</small><strong>{selectedLocation ? selectedLocation.name : t("shell.allLocations")}</strong></span>
            <ChevronDown size={15} className={locationOpen ? "rotate" : ""} />
          </button>
          {locationOpen && (
            <div className="location-menu">
              <button className={location === "all" ? "selected" : ""} onClick={() => { setLocation("all"); setLocationOpen(false); }}>
                <span><strong>{t("shell.allLocations")}</strong><small>{t("shell.locationsCount", { count: locations.length })}</small></span>{location === "all" && <Check size={15} />}
              </button>
              {locations.map((item) => (
                <button key={item.id} className={item.id === location ? "selected" : ""} onClick={() => { setLocation(item.id); setLocationOpen(false); }}>
                  <span><strong>{item.name}</strong><small>{t("shell.employeesCount", { count: employees.filter((e) => (e.currentLocationId ?? e.homeLocationId) === item.id).length })}</small></span>
                  {item.id === location && <Check size={15} />}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="sidebar-scroll">
          <nav className="main-nav" aria-label={t("shell.mainNav")}>
            <p className="nav-label">{t("nav.section.operations")}</p>
            {availableNav.map(({ key, labelKey, icon: Icon }) => {
              const badge = key === "absences" ? absences.filter((a) => a.status === "pending").length
                : key === "chat" ? coverage.filter((c) => c.status === "open").length
                : key === "planner" ? shifts.filter((s) => s.status === "open").length : 0;
              return (
                <button className={activeNav === key ? "active" : ""} key={key} onClick={() => setActiveNav(key)}>
                  <Icon size={18} strokeWidth={1.9} /><span>{t(labelKey)}</span>{badge > 0 && <em>{badge}</em>}
                </button>
              );
            })}
            {currentUser.role !== "employee" && (
              <>
                <p className="nav-label nav-label-second">{t("nav.section.system")}</p>
                <button className={activeNav === "settings" ? "active" : ""} onClick={() => setActiveNav("settings")}><Settings2 size={18} /><span>{t("nav.settings")}</span></button>
                {currentUser.role === "owner" && (
                  <>
                    <button className={activeNav === "billing" ? "active" : ""} onClick={() => setActiveNav("billing")}><Banknote size={18} /><span>{t("nav.billing")}</span></button>
                    <button className={activeNav === "auditlog" ? "active" : ""} onClick={() => setActiveNav("auditlog")}><History size={18} /><span>{t("nav.auditlog")}</span></button>
                  </>
                )}
              </>
            )}
          </nav>
        </div>

        <div className="sidebar-footer">
          <div className="ai-status-card">
            <div className="ai-orbit"><Sparkles size={16} /></div>
            <div><strong>{t("shell.engineActive")}</strong><span><i /> {t("shell.liveData")}</span></div>
          </div>
          <div className="profile-card">
            <div className={`avatar ${currentUser.color}`}>{initials(currentUser.name)}</div>
            <div><strong>{currentUser.name}</strong><span>{t(`role.${currentUser.role}`)}</span></div>
          </div>
          <button className="sidebar-logout" onClick={logout}><LogOut size={16} /> {t("shell.logout")}</button>
          <LanguageSwitcher />
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div><p>{new Date().toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" })}</p><h1>{activeNav === "resumen" ? t("shell.hello", { name: currentUser.name.split(" ")[0] }) : t(availableNav.find((n) => n.key === activeNav)?.labelKey ?? (activeNav === "settings" ? "nav.settings" : activeNav === "billing" ? "nav.billing" : activeNav === "auditlog" ? "nav.auditlog" : "nav.resumen"))}</h1></div>
          <div className="topbar-actions">
            <button className="icon-button" onClick={toggleTheme} aria-label={theme === "light" ? t("shell.darkTheme") : t("shell.lightTheme")}>{theme === "light" ? <Moon size={18} /> : <Sun size={18} />}</button>
            <div className="notif-wrap">
              <button className="icon-button" aria-label={t("shell.notifications")} aria-expanded={notifOpen} onClick={toggleNotifications}>
                <Bell size={19} />{notifUnread > 0 && <span className="notification-dot" />}
              </button>
              {notifOpen && (
                <>
                  <div className="notif-scrim" onClick={() => setNotifOpen(false)} />
                  <div className="notif-menu">
                    <div className="notif-menu-head"><strong>{t("notif.title")}</strong></div>
                    {notifications.length === 0 ? (
                      <div className="notif-empty">{t("notif.empty")}</div>
                    ) : (
                      <div className="notif-list">
                        {notifications.map((n) => (
                          <div key={n.id} className={`notif-item${n.readAt ? "" : " unread"}`}>
                            <strong>{n.title}</strong>
                            {n.body && <p>{n.body}</p>}
                            <small>{timeAgo(n.createdAt, locale)}</small>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
            {currentUser.role !== "employee" && <button className="primary-button" onClick={() => { setAiModal(true); setGenerateResult(null); }}><WandSparkles size={17} /> {t("shell.generateWeekAI")}</button>}
          </div>
        </header>

        {banner && <div className="banner-error"><AlertTriangle size={14} /> {banner} <button onClick={() => setBanner(null)} aria-label={t("shell.close")}><X size={13} /></button></div>}

        <div className={`content ${currentUser.role === "employee" ? "density-airy" : "density-compact"}`}>
          {loading ? <div className="empty-state">{t("shell.loading")}</div> : (
            <>
              {activeNav === "resumen" && <ResumenView employees={employees} shifts={shifts} weekStart={weekStart} weekEnd={weekEnd} location={location} locations={locations} absences={absences} coverage={coverage} attendanceToday={attendanceToday} onGoPlanner={() => setActiveNav("planner")} onGoAusencias={() => setActiveNav("absences")} onGoChat={() => setActiveNav("chat")} onGoTimeTracking={() => setActiveNav("timetracking")} onGoCosts={() => setActiveNav("costs")} />}
              {activeNav === "myshift" && <MyShiftView shift={currentUserToday} locations={locations} tasks={tasks} currentUser={currentUser} />}
              {activeNav === "planner" && (
                <PlannerView
                  employees={locationEmployees} shifts={shifts} locations={locations} location={location}
                  weekStart={weekStart} weekEnd={weekEnd}
                  onPrevWeek={() => setWeekStart(toISODate(addDays(new Date(`${weekStart}T00:00:00`), -7)))}
                  onNextWeek={() => setWeekStart(toISODate(addDays(new Date(`${weekStart}T00:00:00`), 7)))}
                  onToday={() => setWeekStart(toISODate(startOfWeek()))}
                  onGenerate={() => { setAiModal(true); setGenerateResult(null); }}
                  onPublish={publishWeek}
                  onAssign={async (shiftId: string, userId: string | null) => { try { await api(`/api/shifts/${shiftId}`, { method: "PATCH", body: JSON.stringify({ userId }) }); await loadAll(); } catch (e) { fail(e); } }}
                  onRequestCoverage={async (shiftId: string) => { try { await api("/api/coverage", { method: "POST", body: JSON.stringify({ shiftId }) }); await loadAll(); } catch (e) { fail(e); } }}
                />
              )}
              {activeNav === "timetracking" && <TimeTrackingView location={selectedLocation ?? locations[0] ?? null} locations={locations} employees={employees} currentUser={currentUser} shift={currentUserToday} onError={fail} />}
              {activeNav === "dailyops" && (
                <DailyOperationsView
                  tasks={tasks} locations={locations} employees={employees}
                  locationId={location !== "all" ? location : locations[0]?.id}
                  currentUserId={currentUser.id}
                  onCreate={async ({ name, locationId: taskLocationId, dueTime, ownerUserId }) => {
                    try { await api("/api/tasks", { method: "POST", body: JSON.stringify({ name, locationId: taskLocationId, dueTime, ownerUserId, date: todayISO() }) }); await loadAll(); } catch (e) { fail(e); }
                  }}
                  onToggle={async (id: string, completed: boolean) => { try { await api(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify({ completed }) }); await loadAll(); } catch (e) { fail(e); } }}
                />
              )}
              {activeNav === "costs" && <CostsView locations={locations} employees={employees} shifts={shifts} />}
              {activeNav === "team" && <TeamView employees={locationEmployees} locations={locations} onTransfer={setTransferTarget} onEdit={async (employeeId, patch) => { try { await api(`/api/employees/${employeeId}`, { method: "PATCH", body: JSON.stringify(patch) }); await loadAll(); } catch (e) { fail(e); } }} />}
              {activeNav === "transfers" && <TransfersView employees={employees} locations={locations} transfers={transfers} onNew={() => setTransferTarget(employees[0] ?? null)} onComplete={async (id: string) => { try { await api(`/api/transfers/${id}`, { method: "PATCH", body: JSON.stringify({ status: "completed" }) }); await loadAll(); } catch (e) { fail(e); } }} />}
              {activeNav === "absences" && currentUser.role === "employee" && (
                <MyAbsencesView unavailableDays={unavailableDays} absences={absences.filter((a) => a.userId === currentUser.id)}
                  onToggleDay={async (date: string) => { try { await api("/api/unavailability", { method: "POST", body: JSON.stringify({ date }) }); await loadAll(); } catch (e) { fail(e); } }}
                  onRequest={async (type: string, startDate: string, endDate: string, note: string) => { try { await api("/api/absences", { method: "POST", body: JSON.stringify({ type, startDate, endDate, note }) }); await loadAll(); } catch (e) { fail(e); } }} />
              )}
              {activeNav === "absences" && currentUser.role !== "employee" && (
                <AbsencesView absences={absences} employees={employees} shifts={shifts}
                  onDecide={async (id: string, status: string) => { try { await api(`/api/absences/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }); await loadAll(); } catch (e) { fail(e); } }} />
              )}
              {activeNav === "chat" && (
                <ChatView coverage={coverage} employees={employees} locations={locations} currentUser={currentUser} openShifts={shifts.filter((s) => s.status === "open")}
                  onOpenCoverage={async (shiftId: string) => { try { await api("/api/coverage", { method: "POST", body: JSON.stringify({ shiftId }) }); await loadAll(); } catch (e) { fail(e); } }}
                  onAccept={async (id: string) => { try { await api(`/api/coverage/${id}/accept`, { method: "POST" }); await loadAll(); } catch (e) { fail(e); } }} />
              )}
              {activeNav === "staff" && <StaffDirectoryView employees={employees} locations={locations} />}
              {activeNav === "locations" && <LocationsView locations={locations} employees={employees} currentUser={currentUser} onCreate={async (name: string) => { try { await api("/api/locations", { method: "POST", body: JSON.stringify({ name }) }); await loadAll(); } catch (e) { fail(e); } }} onOpenStaff={() => setActiveNav("staff")} onVerify={async (id: string, latitude: number, longitude: number, radiusMeters: number) => { try { await api(`/api/locations/${id}`, { method: "PATCH", body: JSON.stringify({ latitude, longitude, radiusMeters }) }); await loadAll(); } catch (e) { fail(e); } }} />}
              {activeNav === "accounts" && currentUser.role !== "employee" && (
                <AccountsView employees={employees} locations={locations} currentUser={currentUser}
                  onCreate={async (payload: Record<string, unknown>) => { try { const result = await api<{ temporaryPassword: string | null; emailed: boolean }>("/api/employees", { method: "POST", body: JSON.stringify(payload) }); await loadAll(); return result; } catch (e) { fail(e); return null; } }}
                  onDelete={async (id: string) => { try { await api(`/api/employees/${id}`, { method: "DELETE" }); await loadAll(); } catch (e) { fail(e); } }} />
              )}
              {activeNav === "settings" && permissions && (
                <SettingsView
                  permissions={permissions}
                  onToggle={async (key: keyof PermissionsT) => { try { await api("/api/permissions", { method: "PATCH", body: JSON.stringify({ [key]: !permissions[key] }) }); await loadAll(); } catch (e) { fail(e); } }}
                  organization={organization}
                  locations={locations}
                  onUpdateOrgLogo={async (logoUrl: string | null) => { try { await api("/api/organization", { method: "PATCH", body: JSON.stringify({ logoUrl }) }); await loadAll(); } catch (e) { fail(e); } }}
                  onUpdateLocationLogo={async (locationId: string, logoUrl: string | null) => { try { await api(`/api/locations/${locationId}`, { method: "PATCH", body: JSON.stringify({ logoUrl }) }); await loadAll(); } catch (e) { fail(e); } }}
                  onUpdatePayPeriod={async (payPeriodStartDay: number) => { try { await api("/api/organization", { method: "PATCH", body: JSON.stringify({ payPeriodStartDay }) }); await loadAll(); } catch (e) { fail(e); } }}
                />
              )}
              {activeNav === "billing" && currentUser.role === "owner" && <BillingView employees={employees} locations={locations} onError={fail} />}
              {activeNav === "auditlog" && currentUser.role === "owner" && <AuditLogView employees={employees} onError={fail} />}
            </>
          )}
        </div>
      </section>

      {transferTarget && (
        <TransferModal employee={transferTarget} locations={locations} onClose={() => setTransferTarget(null)}
          onConfirm={async (toLocationId: string, type: string, startDate: string) => {
            try { await api("/api/transfers", { method: "POST", body: JSON.stringify({ userId: transferTarget.id, toLocationId, type, startDate }) }); setTransferTarget(null); await loadAll(); } catch (e) { fail(e); }
          }} />
      )}

      {aiModal && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => !generating && setAiModal(false)}>
          <section className="ai-modal" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setAiModal(false)} aria-label={t("shell.close")}><X size={18} /></button>
            {!generateResult ? (
              <>
                <div className="modal-orb"><Sparkles size={26} /></div>
                <span className="modal-kicker">{t("ai.kicker")}</span>
                <h2>{t("ai.title", { range: formatWeekRange(weekStart, lang) })}</h2>
                <p>{t("ai.description")}</p>
                <label className="generation-scope"><span>Planning period</span><select value={generationScope} onChange={(e) => setGenerationScope(e.target.value as "week" | "pay-period")}><option value="week">This week</option><option value="pay-period">Full payroll period</option></select></label>
                <div className="rule-list">
                  <span><Check size={15} /> {t("ai.employeesConsidered", { count: locationEmployees.length })}</span>
                  <span><Check size={15} /> {t("ai.absencesRespected")}</span>
                  <span><Check size={15} /> {t("ai.unavailabilityRespected")}</span>
                  <span><Check size={15} /> {t("ai.hoursBalanced")}</span>
                  <span><Check size={15} /> Weekly and monthly targets respected</span>
                </div>
                <button className="primary-button modal-action" onClick={generateSchedule} disabled={generating}>
                  {generating ? <><LoaderCircle className="spin" size={17} /> {t("ai.generating")}</> : <><WandSparkles size={17} /> {t("ai.generate")}</>}
                </button>
              </>
            ) : (
              <div className="success-state">
                <div className="success-check"><Check size={30} /></div>
                <span className="modal-kicker">{t("ai.resultKicker")}</span>
                <h2>{t("ai.resultTitle", { count: generateResult.created })}</h2>
                <p>{t("ai.resultDescription", { coverage: generateResult.coverage })}</p>
                <div className="success-stats"><span><strong>{generateResult.open}</strong> {t("ai.resultOpen")}</span><span><strong>{generateResult.coverage}%</strong> {t("ai.resultCoverage")}</span></div>
                <button className="primary-button modal-action" onClick={() => { setAiModal(false); setActiveNav("planner"); }}>{t("ai.review")} <ArrowUpRight size={16} /></button>
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
