"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Geolocation } from "@capacitor/geolocation";
import {
  AlertTriangle, ArrowLeftRight, ArrowUpRight, Bell, Banknote, Building2, Crown, CalendarDays,
  CalendarX2, Check, CheckCircle2, ChevronDown, Clock3, ClipboardCheck, FileCheck2, Fingerprint,
  LayoutDashboard, LockKeyhole, LoaderCircle, LogOut, Mail, MapPin, Moon, Phone, MessageCircle,
  Search, Send, ReceiptText, Settings2, ShieldCheck, Sparkles, Store, Sun, Umbrella, Trash2,
  UserPlus, UserCheck, UsersRound, WandSparkles, X,
} from "lucide-react";
import { formatWeekRange, startOfWeek, toISODate, addDays, todayISO } from "@/lib/dates";
import {
  ResumenView, MyShiftView, PlannerView, TimeTrackingView, DailyOperationsView, CostsView,
  TeamView, TransfersView, MyAbsencesView, AbsencesView, ChatView, StaffDirectoryView,
  LocationsView, AccountsView, SettingsView, TransferModal,
} from "@/app/app-shell-views";

type Role = "owner" | "manager" | "employee";

type CurrentUser = {
  id: string; orgId: string; name: string; email: string; role: Role;
  occupation: string; phone: string; color: string;
  homeLocationId: string | null; currentLocationId: string | null;
};

type LocationT = {
  id: string; name: string; address: string; openHours: string;
  latitude: number; longitude: number; radiusMeters: number; budgetCents: number;
};

type EmployeeT = {
  id: string; name: string; email: string; role: Role; occupation: string; phone: string;
  color: string; homeLocationId: string | null; currentLocationId: string | null;
  hourlyRateCents: number; weeklyHourTarget: number;
};

type ShiftT = {
  id: string; locationId: string; userId: string | null; date: string;
  startTime: string; endTime: string; role: string; status: string; published: number; aiGenerated: number;
};

type AbsenceT = { id: string; userId: string; type: string; startDate: string; endDate: string; status: string; note: string };
type TransferT = { id: string; userId: string; fromLocationId: string; toLocationId: string; type: string; startDate: string; endDate: string | null; status: string };
type TaskT = { id: string; locationId: string; name: string; ownerUserId: string | null; dueTime: string; date: string; automatic: number; completed: number };
type CoverageCandidateT = { id: string; requestId: string; userId: string; matchScore: number; status: string };
type CoverageRequestT = { id: string; shiftId: string; reason: string; status: string; acceptedByUserId: string | null; shift: ShiftT | null; candidates: CoverageCandidateT[] };
type PermissionsT = { approveLeave: number; moveEmployees: number; editPublished: number; overrideAI: number };

const ROLE_LABEL: Record<Role, string> = { owner: "Propietario/a", manager: "Manager", employee: "Empleado/a" };
const AVATAR_COLORS = ["blue", "green", "orange", "pink", "lilac"];

const managementNavItems = [
  { label: "Resumen", icon: LayoutDashboard },
  { label: "Planificador", icon: CalendarDays },
  { label: "Registro horario", icon: Fingerprint },
  { label: "Operación diaria", icon: ClipboardCheck },
  { label: "Costes y nómina", icon: Banknote },
  { label: "Equipo", icon: UsersRound },
  { label: "Traslados", icon: ArrowLeftRight },
  { label: "Ausencias", icon: Umbrella },
  { label: "Chat", icon: MessageCircle },
  { label: "Personal", icon: UserCheck },
  { label: "Locales", icon: Store },
  { label: "Cuentas", icon: ShieldCheck },
];

const employeeNavItems = [
  { label: "Mi turno", icon: CalendarDays },
  { label: "Registro horario", icon: Fingerprint },
  { label: "Personal", icon: UserCheck },
  { label: "Locales", icon: Store },
  { label: "Ausencias", icon: Umbrella },
  { label: "Chat", icon: MessageCircle },
];

function initials(name: string) {
  return name.split(" ").filter(Boolean).map((part) => part[0]).slice(0, 2).join("").toUpperCase();
}

function money(cents: number) {
  return (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "DKK", maximumFractionDigits: 0 });
}

function hoursBetween(start: string, end: string) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return (eh * 60 + em - (sh * 60 + sm)) / 60;
}

async function api<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Algo salió mal.");
  return data as T;
}

export default function AppShell({ currentUser }: { currentUser: CurrentUser }) {
  const router = useRouter();
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [location, setLocation] = useState("all");
  const [locationOpen, setLocationOpen] = useState(false);
  const [activeNav, setActiveNav] = useState(currentUser.role === "employee" ? "Mi turno" : "Resumen");
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState<string | null>(null);

  const [locations, setLocations] = useState<LocationT[]>([]);
  const [employees, setEmployees] = useState<EmployeeT[]>([]);
  const [shifts, setShifts] = useState<ShiftT[]>([]);
  const [absences, setAbsences] = useState<AbsenceT[]>([]);
  const [unavailableDays, setUnavailableDays] = useState<string[]>([]);
  const [transfers, setTransfers] = useState<TransferT[]>([]);
  const [tasks, setTasks] = useState<TaskT[]>([]);
  const [coverage, setCoverage] = useState<CoverageRequestT[]>([]);
  const [permissions, setPermissions] = useState<PermissionsT | null>(null);

  const [weekStart, setWeekStart] = useState(() => toISODate(startOfWeek()));
  const weekEnd = useMemo(() => toISODate(addDays(new Date(`${weekStart}T00:00:00`), 6)), [weekStart]);

  const [aiModal, setAiModal] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateResult, setGenerateResult] = useState<{ created: number; open: number; coverage: number } | null>(null);
  const [transferTarget, setTransferTarget] = useState<EmployeeT | null>(null);

  const fail = (error: unknown) => setBanner(error instanceof Error ? error.message : "Algo salió mal.");

  const loadAll = useCallback(async () => {
    try {
      const [loc, emp, shf, abs, unavail, trf, tsk, cov, perm] = await Promise.all([
        api<{ locations: LocationT[] }>("/api/locations"),
        api<{ employees: EmployeeT[] }>("/api/employees"),
        api<{ shifts: ShiftT[] }>(`/api/shifts?from=${weekStart}&to=${weekEnd}`),
        api<{ absences: AbsenceT[] }>("/api/absences"),
        api<{ dates: string[] }>("/api/unavailability"),
        api<{ transfers: TransferT[] }>("/api/transfers"),
        api<{ tasks: TaskT[] }>(`/api/tasks?date=${todayISO()}`),
        api<{ requests: CoverageRequestT[] }>("/api/coverage"),
        api<{ permissions: PermissionsT | null }>("/api/permissions"),
      ]);
      setLocations(loc.locations);
      setEmployees(emp.employees);
      setShifts(shf.shifts);
      setAbsences(abs.absences);
      setUnavailableDays(unavail.dates);
      setTransfers(trf.transfers);
      setTasks(tsk.tasks);
      setCoverage(cov.requests);
      setPermissions(perm.permissions);
    } catch (error) {
      fail(error);
    } finally {
      setLoading(false);
    }
  }, [weekStart, weekEnd]);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    const savedTheme = (localStorage.getItem("ai-schedule-theme") as "light" | "dark" | null) ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
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
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
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
        body: JSON.stringify({ weekStart, locationIds: location === "all" ? undefined : [location] }),
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
        <div className="brand"><div className="brand-mark"><Sparkles size={18} fill="currentColor" /></div><span>AI Schedule</span></div>

        <div className="location-picker">
          <button className="location-trigger" onClick={() => setLocationOpen((v) => !v)} aria-expanded={locationOpen} aria-label="Cambiar local">
            <span className="location-symbol"><Building2 size={17} /></span>
            <span className="location-copy"><small>Tu organización</small><strong>{selectedLocation ? selectedLocation.name : "Todos los locales"}</strong></span>
            <ChevronDown size={15} className={locationOpen ? "rotate" : ""} />
          </button>
          {locationOpen && (
            <div className="location-menu">
              <button className={location === "all" ? "selected" : ""} onClick={() => { setLocation("all"); setLocationOpen(false); }}>
                <span><strong>Todos los locales</strong><small>{locations.length} locales</small></span>{location === "all" && <Check size={15} />}
              </button>
              {locations.map((item) => (
                <button key={item.id} className={item.id === location ? "selected" : ""} onClick={() => { setLocation(item.id); setLocationOpen(false); }}>
                  <span><strong>{item.name}</strong><small>{employees.filter((e) => (e.currentLocationId ?? e.homeLocationId) === item.id).length} empleados</small></span>
                  {item.id === location && <Check size={15} />}
                </button>
              ))}
            </div>
          )}
        </div>

        <nav className="main-nav" aria-label="Navegación principal">
          <p className="nav-label">OPERACIONES</p>
          {availableNav.map(({ label, icon: Icon }) => {
            const badge = label === "Ausencias" ? absences.filter((a) => a.status === "pending").length
              : label === "Chat" ? coverage.filter((c) => c.status === "open").length
              : label === "Planificador" ? shifts.filter((s) => s.status === "open").length : 0;
            return (
              <button className={activeNav === label ? "active" : ""} key={label} onClick={() => setActiveNav(label)}>
                <Icon size={18} strokeWidth={1.9} /><span>{label}</span>{badge > 0 && <em>{badge}</em>}
              </button>
            );
          })}
          {currentUser.role !== "employee" && (
            <><p className="nav-label nav-label-second">SISTEMA</p>
            <button className={activeNav === "Configuración" ? "active" : ""} onClick={() => setActiveNav("Configuración")}><Settings2 size={18} /><span>Configuración</span></button></>
          )}
        </nav>

        <div className="ai-status-card">
          <div className="ai-orbit"><Sparkles size={16} /></div>
          <div><strong>Motor de planificación activo</strong><span><i /> Datos en vivo</span></div>
        </div>

        <div className="profile-card">
          <div className={`avatar ${currentUser.color}`}>{initials(currentUser.name)}</div>
          <div><strong>{currentUser.name}</strong><span>{ROLE_LABEL[currentUser.role]}</span></div>
          <button aria-label="Cerrar sesión" onClick={logout}><LogOut size={15} /></button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div><p>{new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}</p><h1>{activeNav === "Resumen" ? `Hola, ${currentUser.name.split(" ")[0]}` : activeNav}</h1></div>
          <div className="topbar-actions">
            <button className="icon-button" onClick={toggleTheme} aria-label={theme === "light" ? "Tema oscuro" : "Tema claro"}>{theme === "light" ? <Moon size={18} /> : <Sun size={18} />}</button>
            <button className="icon-button" aria-label="Notificaciones"><Bell size={19} />{(absences.filter(a=>a.status==="pending").length + coverage.filter(c=>c.status==="open").length) > 0 && <span className="notification-dot" />}</button>
            {currentUser.role !== "employee" && <button className="primary-button" onClick={() => { setAiModal(true); setGenerateResult(null); }}><WandSparkles size={17} /> Generar semana con IA</button>}
          </div>
        </header>

        {banner && <div className="banner-error"><AlertTriangle size={14} /> {banner} <button onClick={() => setBanner(null)} aria-label="Cerrar"><X size={13} /></button></div>}

        <div className="content">
          {loading ? <div className="empty-state">Cargando datos de tu organización…</div> : (
            <>
              {activeNav === "Resumen" && <ResumenView employees={employees} shifts={shifts} weekStart={weekStart} weekEnd={weekEnd} location={location} locations={locations} absences={absences} coverage={coverage} onGoPlanner={() => setActiveNav("Planificador")} onGoAusencias={() => setActiveNav("Ausencias")} onGoChat={() => setActiveNav("Chat")} />}
              {activeNav === "Mi turno" && <MyShiftView shift={currentUserToday} locations={locations} tasks={tasks} currentUser={currentUser} />}
              {activeNav === "Planificador" && (
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
              {activeNav === "Registro horario" && <TimeTrackingView location={selectedLocation ?? locations[0] ?? null} currentUser={currentUser} shift={currentUserToday} onError={fail} />}
              {activeNav === "Operación diaria" && <DailyOperationsView tasks={tasks} locationId={location !== "all" ? location : locations[0]?.id} onCreate={async (name: string) => { if (!locations[0]) return; try { await api("/api/tasks", { method: "POST", body: JSON.stringify({ name, locationId: location !== "all" ? location : locations[0].id, date: todayISO() }) }); await loadAll(); } catch (e) { fail(e); } }} onToggle={async (id: string, completed: boolean) => { try { await api(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify({ completed }) }); await loadAll(); } catch (e) { fail(e); } }} />}
              {activeNav === "Costes y nómina" && <CostsView locations={locations} employees={employees} shifts={shifts} />}
              {activeNav === "Equipo" && <TeamView employees={locationEmployees} locations={locations} onTransfer={setTransferTarget} />}
              {activeNav === "Traslados" && <TransfersView employees={employees} locations={locations} transfers={transfers} onNew={() => setTransferTarget(employees[0] ?? null)} onComplete={async (id: string) => { try { await api(`/api/transfers/${id}`, { method: "PATCH", body: JSON.stringify({ status: "completed" }) }); await loadAll(); } catch (e) { fail(e); } }} />}
              {activeNav === "Ausencias" && currentUser.role === "employee" && (
                <MyAbsencesView unavailableDays={unavailableDays} absences={absences.filter((a) => a.userId === currentUser.id)}
                  onToggleDay={async (date: string) => { try { await api("/api/unavailability", { method: "POST", body: JSON.stringify({ date }) }); await loadAll(); } catch (e) { fail(e); } }}
                  onRequest={async (type: string, startDate: string, endDate: string, note: string) => { try { await api("/api/absences", { method: "POST", body: JSON.stringify({ type, startDate, endDate, note }) }); await loadAll(); } catch (e) { fail(e); } }} />
              )}
              {activeNav === "Ausencias" && currentUser.role !== "employee" && (
                <AbsencesView absences={absences} employees={employees}
                  onDecide={async (id: string, status: string) => { try { await api(`/api/absences/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }); await loadAll(); } catch (e) { fail(e); } }} />
              )}
              {activeNav === "Chat" && (
                <ChatView coverage={coverage} employees={employees} locations={locations} currentUser={currentUser} openShifts={shifts.filter((s) => s.status === "open")}
                  onOpenCoverage={async (shiftId: string) => { try { await api("/api/coverage", { method: "POST", body: JSON.stringify({ shiftId }) }); await loadAll(); } catch (e) { fail(e); } }}
                  onAccept={async (id: string) => { try { await api(`/api/coverage/${id}/accept`, { method: "POST" }); await loadAll(); } catch (e) { fail(e); } }} />
              )}
              {activeNav === "Personal" && <StaffDirectoryView employees={employees} locations={locations} />}
              {activeNav === "Locales" && <LocationsView locations={locations} employees={employees} currentUser={currentUser} onCreate={async (name: string) => { try { await api("/api/locations", { method: "POST", body: JSON.stringify({ name }) }); await loadAll(); } catch (e) { fail(e); } }} onOpenStaff={() => setActiveNav("Personal")} />}
              {activeNav === "Cuentas" && currentUser.role !== "employee" && (
                <AccountsView employees={employees} locations={locations} currentUser={currentUser}
                  onCreate={async (payload: Record<string, unknown>) => { try { const result = await api<{ temporaryPassword: string }>("/api/employees", { method: "POST", body: JSON.stringify(payload) }); await loadAll(); return result.temporaryPassword; } catch (e) { fail(e); return null; } }}
                  onDelete={async (id: string) => { try { await api(`/api/employees/${id}`, { method: "DELETE" }); await loadAll(); } catch (e) { fail(e); } }} />
              )}
              {activeNav === "Configuración" && permissions && (
                <SettingsView permissions={permissions} onToggle={async (key: keyof PermissionsT) => { try { await api("/api/permissions", { method: "PATCH", body: JSON.stringify({ [key]: !permissions[key] }) }); await loadAll(); } catch (e) { fail(e); } }} />
              )}
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
            <button className="modal-close" onClick={() => setAiModal(false)} aria-label="Cerrar"><X size={18} /></button>
            {!generateResult ? (
              <>
                <div className="modal-orb"><Sparkles size={26} /></div>
                <span className="modal-kicker">PLANIFICADOR INTELIGENTE</span>
                <h2>Generar semana · {formatWeekRange(weekStart)}</h2>
                <p>Se asignarán turnos respetando vacaciones aprobadas, indisponibilidades marcadas y el objetivo de horas de cada persona.</p>
                <div className="rule-list">
                  <span><Check size={15} /> {locationEmployees.length} empleados considerados</span>
                  <span><Check size={15} /> Ausencias aprobadas respetadas</span>
                  <span><Check size={15} /> Indisponibilidades respetadas</span>
                  <span><Check size={15} /> Horas balanceadas por objetivo semanal</span>
                </div>
                <button className="primary-button modal-action" onClick={generateSchedule} disabled={generating}>
                  {generating ? <><LoaderCircle className="spin" size={17} /> Generando…</> : <><WandSparkles size={17} /> Generar planificación</>}
                </button>
              </>
            ) : (
              <div className="success-state">
                <div className="success-check"><Check size={30} /></div>
                <span className="modal-kicker">PLANIFICACIÓN GENERADA</span>
                <h2>{generateResult.created} turnos organizados</h2>
                <p>Cobertura estimada del {generateResult.coverage}%. Es un borrador: revísalo y publica la semana cuando estés listo.</p>
                <div className="success-stats"><span><strong>{generateResult.open}</strong> sin cubrir</span><span><strong>{generateResult.coverage}%</strong> cobertura</span></div>
                <button className="primary-button modal-action" onClick={() => { setAiModal(false); setActiveNav("Planificador"); }}>Revisar propuesta <ArrowUpRight size={16} /></button>
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
