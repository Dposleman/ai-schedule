"use client";

import { useEffect, useMemo, useState } from "react";
import { Geolocation } from "@capacitor/geolocation";
import {
  AlertTriangle, ArrowLeftRight, ArrowUpRight, Bot, Building2, Crown, CalendarDays,
  CalendarX2, Check, CheckCircle2, ClipboardCheck, Clock3, FileCheck2, Fingerprint, LockKeyhole,
  Mail, MapPin, Phone, ReceiptText, Search, Send, ShieldCheck, Sparkles, Store,
  Trash2, Umbrella, UserPlus, UserCheck, UsersRound, WandSparkles, X,
} from "lucide-react";
import { weekDays, formatWeekRange, todayISO } from "@/lib/dates";

function initials(name: string) {
  return name.split(" ").filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}
function money(cents: number) {
  return (cents / 100).toLocaleString("es-ES", { style: "currency", currency: "DKK", maximumFractionDigits: 0 });
}
function hoursBetween(start: string, end: string) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return (eh * 60 + em - (sh * 60 + sm)) / 60;
}

/* ---------------- Resumen ---------------- */
export function MetricCard({ label, value, detail, tone, icon: Icon }: { label: string; value: string; detail: string; tone: string; icon: React.ComponentType<{ size?: number }> }) {
  return (
    <article className="metric-card">
      <div className={`metric-icon ${tone}`}><Icon size={18} /></div>
      <div><p className="eyebrow">{label}</p><div className="metric-value-row"><strong>{value}</strong></div><p className="metric-detail">{detail}</p></div>
    </article>
  );
}

export function ResumenView({ employees, shifts, weekStart, weekEnd, location, locations, absences, coverage, onGoPlanner, onGoAusencias, onGoChat }: any) {
  const weekShifts = shifts.filter((s: any) => location === "all" || s.locationId === location);
  const assignedHours = weekShifts.filter((s: any) => s.userId).reduce((sum: number, s: any) => sum + hoursBetween(s.startTime, s.endTime), 0);
  const totalShifts = weekShifts.length;
  const coveredShifts = weekShifts.filter((s: any) => s.userId).length;
  const coveragePct = totalShifts === 0 ? 0 : Math.round((coveredShifts / totalShifts) * 100);
  const scopedEmployees = employees.filter((e: any) => location === "all" || (e.currentLocationId ?? e.homeLocationId) === location);
  const pendingAbsences = absences.filter((a: any) => a.status === "pending");
  const openCoverage = coverage.filter((c: any) => c.status === "open");
  const days = weekDays(weekStart);
  const locationName = location === "all" ? "todos los locales" : locations.find((l: any) => l.id === location)?.name ?? "";

  return (
    <>
      <section className="hero-strip">
        <div className="hero-copy">
          <span className="hero-badge"><Sparkles size={13} /> RESUMEN DE LA SEMANA</span>
          <h2>{formatWeekRange(weekStart)}</h2>
          <p>{totalShifts > 0 ? `${coveredShifts} de ${totalShifts} turnos cubiertos en ${locationName}.` : "Todavía no hay turnos generados para esta semana."}</p>
        </div>
        <div className="hero-result">
          <div className="score-ring"><strong>{coveragePct}</strong><span>%</span></div>
          <div><strong>Cobertura de la semana</strong><span>{totalShifts - coveredShifts} turnos sin cubrir</span></div>
        </div>
      </section>

      <section className="metrics-grid">
        <MetricCard label="HORAS ASIGNADAS" value={`${Math.round(assignedHours)} h`} detail={`${weekShifts.length} turnos en la semana`} tone="violet" icon={Clock3} />
        <MetricCard label="COBERTURA" value={`${coveragePct}%`} detail={`${coveredShifts} de ${totalShifts} turnos`} tone="green" icon={ShieldCheck} />
        <MetricCard label="EQUIPO" value={String(scopedEmployees.length)} detail="personas en este local" tone="blue" icon={UsersRound} />
        <MetricCard label="POR DECIDIR" value={String(pendingAbsences.length + openCoverage.length)} detail="solicitudes y coberturas abiertas" tone="orange" icon={Sparkles} />
      </section>

      <section className="dashboard-grid">
        <article className="schedule-card">
          <div className="section-heading">
            <div><div className="section-title-line"><h3>Plan de la semana</h3>{weekShifts.some((s: any) => s.aiGenerated && !s.published) && <span className="draft-pill">BORRADOR</span>}</div><p>{formatWeekRange(weekStart)} · {locationName}</p></div>
            <button className="secondary-button" onClick={onGoPlanner}>Abrir planificador <ArrowUpRight size={14} /></button>
          </div>
          {weekShifts.length === 0 ? (
            <div className="empty-state">Aún no hay turnos esta semana. Genera una planificación con IA desde el Planificador.</div>
          ) : (
            <div className="schedule-scroll">
              <div className="schedule-table">
                <div className="schedule-head employee-head">EMPLEADO</div>
                {days.map((d) => <div className="schedule-head day-head" key={d.date}><span>{d.label}</span><strong>{d.dayNumber}</strong></div>)}
                {scopedEmployees.slice(0, 8).map((employee: any) => (
                  <div className="schedule-row" key={employee.id}>
                    <div className="employee-cell"><div className={`avatar ${employee.color}`}>{initials(employee.name)}</div><div><strong>{employee.name}</strong><span>{employee.occupation}</span></div></div>
                    {days.map((d) => {
                      const shift = weekShifts.find((s: any) => s.userId === employee.id && s.date === d.date);
                      return <div className="shift-cell" key={d.date}><div className={`shift-block ${shift ? "work" : "empty"}`}>{shift ? <><i /><span>{shift.startTime}–{shift.endTime}</span></> : <span>—</span>}</div></div>;
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}
        </article>

        <aside className="attention-card">
          <div className="section-heading compact"><div><h3>Requiere atención</h3><p>En vivo</p></div><span className="attention-count">{pendingAbsences.length + openCoverage.length}</span></div>
          <div className="attention-list">
            {openCoverage.map((c: any) => (
              <button className="attention-item urgent" key={c.id} onClick={onGoChat}>
                <span className="attention-icon"><AlertTriangle size={17} /></span>
                <span className="attention-copy"><em>COBERTURA URGENTE</em><strong>{c.shift ? `${c.shift.date} · ${c.shift.startTime}–${c.shift.endTime}` : "Turno sin cubrir"}</strong><small>{c.reason}</small></span>
                <span className="attention-arrow">›</span>
              </button>
            ))}
            {pendingAbsences.map((a: any) => (
              <button className="attention-item" key={a.id} onClick={onGoAusencias}>
                <span className="attention-icon leave"><Umbrella size={17} /></span>
                <span className="attention-copy"><em>SOLICITUD</em><strong>{a.type === "vacation" ? "Vacaciones" : a.type === "sick" ? "Baja" : "Indisponibilidad"}</strong><small>{a.startDate} – {a.endDate}</small></span>
                <span className="attention-arrow">›</span>
              </button>
            ))}
            {pendingAbsences.length === 0 && openCoverage.length === 0 && <p className="empty-state">No hay nada pendiente ahora mismo.</p>}
          </div>
        </aside>
      </section>
    </>
  );
}

/* ---------------- Mi turno (employee) ---------------- */
export function MyShiftView({ shift, locations, tasks, currentUser }: any) {
  const location = locations.find((l: any) => l.id === shift?.locationId);
  return (
    <div className="view-stack">
      <div className="view-heading"><div><span className="view-kicker">MI TURNO</span><h2>{shift ? `Hoy en ${location?.name ?? "tu local"}` : "Hoy no tienes turno asignado"}</h2><p>Solo ves tu horario y tus solicitudes personales.</p></div>
        {shift && <span className="status-pill available">Confirmado</span>}
      </div>
      {shift ? (
        <section className="my-shift-grid">
          <article className="my-shift-main"><small>HOY · {shift.role || currentUser.occupation}</small><strong>{shift.startTime}–{shift.endTime}</strong><span><MapPin size={14} /> {location?.name}</span></article>
          <article><ClipboardCheck size={21} /><strong>{tasks.filter((t: any) => t.completed).length} de {tasks.length} tareas</strong><span>en tu local hoy</span></article>
        </section>
      ) : (
        <div className="empty-state">No tienes ningún turno publicado para hoy.</div>
      )}
    </div>
  );
}

/* ---------------- Planificador ---------------- */
export function PlannerView({ employees, shifts, locations, location, weekStart, weekEnd, onPrevWeek, onNextWeek, onToday, onGenerate, onPublish, onAssign, onRequestCoverage }: any) {
  const days = weekDays(weekStart);
  const scoped = shifts.filter((s: any) => location === "all" || s.locationId === location);
  const hasDraft = scoped.some((s: any) => s.aiGenerated === 1 && s.published === 0);
  const [editing, setEditing] = useState<any | null>(null);

  return (
    <div className="view-stack">
      <div className="view-heading">
        <div><span className="view-kicker">PLANIFICACIÓN</span><h2>{formatWeekRange(weekStart)}</h2><p>Genera con IA, revisa el borrador y publica cuando esté listo.</p></div>
        <div className="view-actions">
          {hasDraft && <button className="secondary-button" onClick={onPublish}><FileCheck2 size={15} /> Publicar semana</button>}
          <button className="primary-button" onClick={onGenerate}><WandSparkles size={16} /> Regenerar con IA</button>
        </div>
      </div>

      <div className="planner-layout">
        <article className="schedule-card full-schedule">
          <div className="section-heading">
            <div><div className="section-title-line"><h3>{location === "all" ? "Todos los locales" : locations.find((l: any) => l.id === location)?.name}</h3>{hasDraft && <span className="draft-pill">BORRADOR</span>}</div><p>{employees.length} empleados · {scoped.length} turnos</p></div>
            <div className="section-actions"><button className="secondary-button" onClick={onToday}>Hoy</button><button className="circle-button" onClick={onPrevWeek} aria-label="Semana anterior">‹</button><button className="circle-button" onClick={onNextWeek} aria-label="Semana siguiente">›</button></div>
          </div>
          {employees.length === 0 ? <div className="empty-state">Añade empleados en Equipo antes de planificar turnos.</div> : (
            <div className="schedule-scroll">
              <div className="schedule-table planner-table">
                <div className="schedule-head employee-head">EMPLEADO</div>
                {days.map((d) => <div className="schedule-head day-head" key={d.date}><span>{d.label}</span><strong>{d.dayNumber}</strong></div>)}
                {employees.map((employee: any) => (
                  <div className="schedule-row" key={employee.id}>
                    <div className="employee-cell"><div className={`avatar ${employee.color}`}>{initials(employee.name)}</div><div><strong>{employee.name}</strong><span>{employee.occupation}</span></div></div>
                    {days.map((d) => {
                      const shift = scoped.find((s: any) => s.userId === employee.id && s.date === d.date);
                      return (
                        <div className="shift-cell" key={d.date}>
                          <button type="button" className={`shift-block ${shift ? "work" : "empty"}`} onClick={() => shift && setEditing(shift)} style={{ border: 0, cursor: shift ? "pointer" : "default", width: "100%" }}>
                            {shift ? <><i /><span>{shift.startTime}–{shift.endTime}</span></> : <span>—</span>}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ))}
                {scoped.filter((s: any) => s.status === "open").length > 0 && (
                  <div className="schedule-row">
                    <div className="employee-cell"><div className="avatar orange">?</div><div><strong>Sin cubrir</strong><span>Turnos abiertos</span></div></div>
                    {days.map((d) => {
                      const open = scoped.find((s: any) => s.status === "open" && s.date === d.date);
                      return <div className="shift-cell" key={d.date}>{open ? <button className="shift-block blocked" onClick={() => onRequestCoverage(open.id)} style={{ border: 0, width: "100%", cursor: "pointer" }}><span>{open.startTime}–{open.endTime}</span></button> : <div className="shift-block empty"><span>—</span></div>}</div>;
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="schedule-legend"><span><i className="legend-work" /> Turno asignado</span><span><i className="legend-off" /> Sin turno</span><button onClick={() => window.print()}>Exportar horario <ArrowUpRight size={14} /></button></div>
        </article>

        <aside className="rules-panel">
          <div className="rules-panel-head"><Sparkles size={17} /><div><strong>Cómo decide la IA</strong><span>Reglas aplicadas</span></div></div>
          <div className="rule-decision"><span className="decision-number">01</span><div><strong>Sin conflictos</strong><p>Nadie se asigna durante vacaciones aprobadas o días marcados como no disponibles.</p></div></div>
          <div className="rule-decision"><span className="decision-number">02</span><div><strong>Horas objetivo</strong><p>Cada persona recibe turnos hasta su objetivo semanal de horas, nunca más.</p></div></div>
          <div className="rule-decision"><span className="decision-number">03</span><div><strong>Reparto equilibrado</strong><p>Se prioriza a quien menos horas lleva asignadas esta semana.</p></div></div>
        </aside>
      </div>

      {editing && (
        <div className="modal-backdrop" onMouseDown={() => setEditing(null)}>
          <section className="ai-modal transfer-modal" onMouseDown={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setEditing(null)}><X size={18} /></button>
            <div className="modal-orb transfer-orb"><CalendarDays size={22} /></div>
            <span className="modal-kicker">TURNO</span>
            <h2>{editing.date} · {editing.startTime}–{editing.endTime}</h2>
            <p>Quita a esta persona del turno si necesita cobertura, o pide un sustituto.</p>
            <div className="modal-account-actions">
              <button className="secondary-button" onClick={() => { onAssign(editing.id, null); setEditing(null); }}>Quitar asignación</button>
              <button className="primary-button modal-action" onClick={() => { onRequestCoverage(editing.id); setEditing(null); }}><Send size={15} /> Buscar cobertura</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

/* ---------------- Registro horario ---------------- */
function distanceInMeters(latitude: number, longitude: number, siteLatitude: number, siteLongitude: number) {
  const radians = (value: number) => (value * Math.PI) / 180;
  const earthRadius = 6_371_000;
  const latitudeDelta = radians(siteLatitude - latitude);
  const longitudeDelta = radians(siteLongitude - longitude);
  const a = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(radians(latitude)) * Math.cos(radians(siteLatitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function TimeTrackingView({ location, currentUser, shift, onError }: any) {
  const [distance, setDistance] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<any | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/attendance").then((r) => r.json()).then((data) => { setOpen(data.open); setLoaded(true); }).catch(() => setLoaded(true));
  }, []);

  const inside = location && distance !== null && distance <= location.radiusMeters && (accuracy ?? 999) <= 60;

  const locate = async () => {
    if (!location) return;
    setLocating(true);
    try {
      const permissions = await Geolocation.requestPermissions();
      if (permissions.location === "denied") throw new Error("Permiso de ubicación denegado");
      const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 });
      setDistance(distanceInMeters(position.coords.latitude, position.coords.longitude, location.latitude, location.longitude));
      setAccuracy(position.coords.accuracy);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo obtener tu ubicación.");
    } finally { setLocating(false); }
  };

  const checkIn = async () => {
    try {
      const response = await fetch("/api/attendance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "check-in", shiftId: shift?.id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setOpen({ id: data.id, checkInAt: new Date().toISOString(), checkOutAt: null });
    } catch (e) { onError(e); }
  };

  const checkOut = async () => {
    if (!open) return;
    try {
      await fetch("/api/attendance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "check-out", id: open.id }) });
      setOpen(null);
    } catch (e) { onError(e); }
  };

  if (!location) return <div className="view-stack"><div className="empty-state">Crea un local primero para poder fichar.</div></div>;

  return (
    <div className="view-stack">
      <div className="view-heading"><div><span className="view-kicker">REGISTRO HORARIO · GPS</span><h2>Fichaje protegido por un radio de {location.radiusMeters} metros</h2><p>Solo puedes iniciar el turno dentro del local.</p></div><span className={`geo-status ${inside ? "inside" : "outside"}`}><MapPin size={15} /> {distance === null ? "Ubicación pendiente" : inside ? "Dentro del radio" : "Fuera del radio"}</span></div>
      <section className="geo-card">
        <div className="geo-radar"><span className={inside ? "device-dot inside" : "device-dot"} /><i /><b>{location.radiusMeters} m</b></div>
        <div className="geo-copy">
          <span className="view-kicker">{location.name}</span>
          <h3>{distance === null ? "Comprueba tu ubicación" : `${Math.round(distance)} m del punto de fichaje`}</h3>
          <p>Precisión GPS: {accuracy === null ? "—" : `±${Math.round(accuracy)} m`}</p>
          {error && <em className="geo-error"><AlertTriangle size={14} /> {error}</em>}
          <div className="geo-actions"><button className="secondary-button" onClick={locate} disabled={locating}><MapPin size={15} /> {locating ? "Localizando…" : "Actualizar ubicación"}</button></div>
        </div>
        <div className="clock-panel">
          <small>{shift ? "Turno de hoy" : "Sin turno hoy"}</small>
          <strong>{shift ? `${shift.startTime}–${shift.endTime}` : "—"}</strong>
          {!loaded ? null : !open ? (
            <button className="primary-button" disabled={!inside} onClick={checkIn}><Fingerprint size={17} /> Fichar entrada</button>
          ) : (
            <><span className="clocked"><i /> Entrada {new Date(open.checkInAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span><button className="primary-button" onClick={checkOut}>Fichar salida</button></>
          )}
        </div>
      </section>
    </div>
  );
}

/* ---------------- Operación diaria ---------------- */
export function DailyOperationsView({ tasks, locationId, onCreate, onToggle }: any) {
  const [name, setName] = useState("");
  return (
    <div className="view-stack">
      <div className="view-heading"><div><span className="view-kicker">OPERACIÓN DIARIA</span><h2>Tareas de hoy</h2><p>Se crean por local y se marcan como completadas al terminarlas.</p></div></div>
      <div className="filter-row">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nueva tarea, p. ej. Control de temperatura" style={{ flex: 1, border: "1px solid var(--line)", borderRadius: 10, padding: "8px 11px", fontSize: 12 }} />
        <button className="primary-button" disabled={!name.trim() || !locationId} onClick={() => { onCreate(name.trim()); setName(""); }}>Añadir tarea</button>
      </div>
      {tasks.length === 0 ? <div className="empty-state">No hay tareas registradas hoy.</div> : (
        <section className="task-board">
          {tasks.map((task: any, index: number) => (
            <article className={task.completed ? "task-item complete" : "task-item"} key={task.id}>
              <span className="task-check">{task.completed ? <Check size={18} /> : index + 1}</span>
              <div><small>{task.dueTime}</small><h3>{task.name}</h3><p>{task.completed ? "Completada" : "Pendiente"}</p></div>
              {!task.completed && <button className="secondary-button" onClick={() => onToggle(task.id, true)}>Marcar completada</button>}
            </article>
          ))}
        </section>
      )}
    </div>
  );
}

/* ---------------- Costes y nómina ---------------- */
export function CostsView({ locations, employees, shifts }: any) {
  return (
    <div className="view-stack">
      <div className="view-heading"><div><span className="view-kicker">COSTES Y NÓMINA</span><h2>Calculado a partir de los turnos reales</h2><p>Coste = horas de cada turno × tarifa por hora del empleado.</p></div><button className="primary-button"><ReceiptText size={16} /> Exportar CSV</button></div>
      <article className="data-card budget-card">
        <div className="card-heading"><div><h3>Presupuesto por local</h3><p>Turnos publicados de las próximas semanas.</p></div><Bot size={20} /></div>
        {locations.map((loc: any) => {
          const locShifts = shifts.filter((s: any) => s.locationId === loc.id && s.userId);
          const actualCents = locShifts.reduce((sum: number, s: any) => {
            const emp = employees.find((e: any) => e.id === s.userId);
            return sum + (emp ? emp.hourlyRateCents * hoursBetween(s.startTime, s.endTime) : 0);
          }, 0);
          const percent = loc.budgetCents > 0 ? Math.round((actualCents / loc.budgetCents) * 100) : 0;
          return (
            <div className="budget-row" key={loc.id}>
              <div><strong>{loc.name}</strong><span>{money(actualCents)} {loc.budgetCents > 0 ? `/ ${money(loc.budgetCents)}` : "(sin presupuesto definido)"}</span></div>
              <div className="budget-track"><i style={{ width: `${Math.min(percent, 100)}%` }} /></div>
              <em className={`status-pill ${percent > 100 ? "away" : "available"}`}>{loc.budgetCents === 0 ? "Define un presupuesto" : percent > 100 ? "Por encima del presupuesto" : "Dentro del objetivo"}</em>
            </div>
          );
        })}
        {locations.length === 0 && <div className="empty-state">Crea locales para ver costes.</div>}
      </article>
    </div>
  );
}

/* ---------------- Equipo ---------------- */
export function TeamView({ employees, locations, onTransfer }: any) {
  const [query, setQuery] = useState("");
  const filtered = employees.filter((e: any) => `${e.name} ${e.occupation}`.toLowerCase().includes(query.toLowerCase()));
  const locationName = (id: string | null) => locations.find((l: any) => l.id === id)?.name ?? "Sin asignar";
  return (
    <div className="view-stack">
      <div className="view-heading"><div><span className="view-kicker">EQUIPO</span><h2>{employees.length} personas</h2><p>Cada persona mantiene un local base y puede apoyar temporalmente a otro.</p></div><label className="directory-search"><Search size={15} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar" /></label></div>
      <article className="data-card">
        <div className="team-table table-head"><span>EMPLEADO</span><span>LOCAL BASE</span><span>LOCAL ACTUAL</span><span>TARIFA/H</span><span>ESTADO</span><span /></div>
        {filtered.map((person: any) => (
          <div className="team-table table-row" key={person.id}>
            <span className="person-summary"><span className={`avatar ${person.color}`}>{initials(person.name)}</span><span><strong>{person.name}</strong><small>{person.occupation}</small></span></span>
            <span><MapPin size={13} /> {locationName(person.homeLocationId)}</span>
            <span><Building2 size={13} /> {locationName(person.currentLocationId)}</span>
            <span className="hours-cell"><strong>{money(person.hourlyRateCents)}</strong></span>
            <span><em className={`status-pill ${person.homeLocationId === person.currentLocationId ? "available" : "transfer"}`}>{person.homeLocationId === person.currentLocationId ? "En su local base" : "Trasladado"}</em></span>
            <span><button className="row-action" onClick={() => onTransfer(person)}>Trasladar <ArrowLeftRight size={13} /></button></span>
          </div>
        ))}
        {filtered.length === 0 && <p className="empty-state">Sin resultados.</p>}
      </article>
    </div>
  );
}

/* ---------------- Traslados ---------------- */
export function TransfersView({ employees, locations, transfers, onNew, onComplete }: any) {
  const locationName = (id: string) => locations.find((l: any) => l.id === id)?.name ?? "—";
  const employeeName = (id: string) => employees.find((e: any) => e.id === id)?.name ?? "—";
  const active = transfers.filter((t: any) => t.status === "active");
  const completed = transfers.filter((t: any) => t.status === "completed");
  return (
    <div className="view-stack">
      <div className="view-heading"><div><span className="view-kicker">TRASLADOS</span><h2>Movilidad entre locales</h2><p>El local base del empleado siempre queda registrado en el historial.</p></div><button className="primary-button" onClick={onNew} disabled={employees.length === 0}><ArrowLeftRight size={16} /> Nuevo traslado</button></div>
      <section className="transfer-summary-grid">
        <article><span className="summary-icon violet"><ArrowLeftRight size={18} /></span><div><small>ACTIVOS AHORA</small><strong>{active.length}</strong><p>en curso</p></div></article>
        <article><span className="summary-icon green"><CheckCircle2 size={18} /></span><div><small>COMPLETADOS</small><strong>{completed.length}</strong><p>histórico</p></div></article>
      </section>
      <article className="data-card transfer-list-card">
        <div className="card-heading"><div><h3>Traslados activos</h3></div><span>{active.length}</span></div>
        {active.map((t: any) => (
          <div className="transfer-route-row" key={t.id}>
            <div className="person-summary"><span className="avatar green">{initials(employeeName(t.userId))}</span><span><strong>{employeeName(t.userId)}</strong></span></div>
            <div className="route-visual"><span><small>ORIGEN</small><strong>{locationName(t.fromLocationId)}</strong></span><i><ArrowUpRight size={15} /></i><span><small>DESTINO</small><strong>{locationName(t.toLocationId)}</strong></span></div>
            <div><em className="status-pill transfer">{t.type === "permanent" ? "Definitivo" : "Temporal"}</em><small className="date-note">desde {t.startDate}</small></div>
            <button className="row-action" onClick={() => onComplete(t.id)}>Finalizar</button>
          </div>
        ))}
        {active.length === 0 && <p className="empty-state">No hay traslados activos.</p>}
      </article>
    </div>
  );
}

/* ---------------- Ausencias (manager) ---------------- */
export function AbsencesView({ absences, employees, onDecide }: any) {
  const employeeName = (id: string) => employees.find((e: any) => e.id === id)?.name ?? "—";
  const pending = absences.filter((a: any) => a.status === "pending");
  const decided = absences.filter((a: any) => a.status !== "pending").slice(0, 6);
  return (
    <div className="view-stack">
      <div className="view-heading"><div><span className="view-kicker">AUSENCIAS Y DISPONIBILIDAD</span><h2>Solicitudes pendientes</h2><p>Una ausencia aprobada nunca recibe asignación en el planificador.</p></div></div>
      <section className="absence-layout">
        <section className="requests-column">
          <div className="card-heading no-border"><div><h3>Pendientes</h3></div><span>{pending.length}</span></div>
          {pending.map((request: any) => (
            <article className="request-card featured-request" key={request.id}>
              <div className="request-person"><span className="avatar pink">{initials(employeeName(request.userId))}</span><div><strong>{employeeName(request.userId)}</strong></div><em>{request.type === "vacation" ? "VACACIONES" : request.type === "sick" ? "BAJA" : "INDISPONIBILIDAD"}</em></div>
              <div className="request-period"><CalendarDays size={17} /><span><small>PERIODO SOLICITADO</small><strong>{request.startDate} – {request.endDate}</strong></span></div>
              {request.note && <p style={{ margin: "6px 0", fontSize: 12, color: "var(--muted)" }}>{request.note}</p>}
              <div className="request-actions"><button className="secondary-button" onClick={() => onDecide(request.id, "rejected")}>Rechazar</button><button className="primary-button" onClick={() => onDecide(request.id, "approved")}><Check size={15} /> Aprobar</button></div>
            </article>
          ))}
          {pending.length === 0 && <p className="empty-state">No hay solicitudes pendientes.</p>}
        </section>
        <aside className="employee-preview-card">
          <div className="phone-label"><span><strong>Últimas decisiones</strong></span></div>
          {decided.map((r: any) => (
            <div key={r.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--line)", fontSize: 12 }}>
              <span>{employeeName(r.userId)} · {r.startDate}</span><em className={`status-pill ${r.status === "approved" ? "available" : "away"}`}>{r.status === "approved" ? "Aprobada" : "Rechazada"}</em>
            </div>
          ))}
          {decided.length === 0 && <p className="preview-note">Sin historial todavía.</p>}
        </aside>
      </section>
    </div>
  );
}

/* ---------------- Mis ausencias (employee) ---------------- */
export function MyAbsencesView({ unavailableDays, absences, onToggleDay, onRequest }: any) {
  const [requesting, setRequesting] = useState(false);
  const [type, setType] = useState("vacation");
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const nextDays = weekDays(todayISO());

  return (
    <div className="view-stack">
      <div className="view-heading"><div><span className="view-kicker">MIS AUSENCIAS</span><h2>Disponibilidad y vacaciones</h2><p>Solo tú ves y gestionas tus propias solicitudes.</p></div><button className="primary-button" onClick={() => setRequesting(true)}><Umbrella size={16} /> Solicitar vacaciones</button></div>
      <article className="data-card personal-absence">
        <div className="card-heading"><div><h3>Mi disponibilidad</h3><p>Marca los días en los que no puedes trabajar.</p></div></div>
        <div className="availability-week">
          {nextDays.map((d) => (
            <button key={d.date} className={unavailableDays.includes(d.date) ? "unavailable" : ""} onClick={() => onToggleDay(d.date)}>
              <span>{d.dayNumber}</span><small>{unavailableDays.includes(d.date) ? "No disponible" : "Disponible"}</small>
            </button>
          ))}
        </div>
      </article>
      <article className="data-card">
        <div className="card-heading"><div><h3>Mis solicitudes</h3></div></div>
        {absences.map((a: any) => (
          <div key={a.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--line)", fontSize: 12 }}>
            <span>{a.type === "vacation" ? "Vacaciones" : a.type === "sick" ? "Baja" : "Indisponibilidad"} · {a.startDate} – {a.endDate}</span>
            <em className={`status-pill ${a.status === "approved" ? "available" : a.status === "rejected" ? "away" : "transfer"}`}>{a.status === "approved" ? "Aprobada" : a.status === "rejected" ? "Rechazada" : "Pendiente"}</em>
          </div>
        ))}
        {absences.length === 0 && <p className="empty-state">Sin solicitudes todavía.</p>}
      </article>

      {requesting && (
        <div className="modal-backdrop" onMouseDown={() => setRequesting(false)}>
          <section className="ai-modal account-modal" onMouseDown={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setRequesting(false)}><X size={18} /></button>
            <div className="modal-orb"><CalendarX2 size={22} /></div>
            <span className="modal-kicker">NUEVA SOLICITUD</span><h2>Solicitar ausencia</h2>
            <div className="transfer-form">
              <label><span>Tipo</span><select value={type} onChange={(e) => setType(e.target.value)}><option value="vacation">Vacaciones</option><option value="sick">Baja médica</option><option value="unavailable">Indisponibilidad</option></select></label>
              <div className="date-fields"><label><span>Desde</span><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label><label><span>Hasta</span><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label></div>
              <label><span>Nota (opcional)</span><input value={note} onChange={(e) => setNote(e.target.value)} /></label>
            </div>
            <button className="primary-button modal-action" onClick={() => { onRequest(type, startDate, endDate, note); setRequesting(false); }}><Check size={16} /> Enviar solicitud</button>
          </section>
        </div>
      )}
    </div>
  );
}

/* ---------------- Chat / cobertura automática ---------------- */
export function ChatView({ coverage, employees, locations, currentUser, openShifts, onOpenCoverage, onAccept }: any) {
  const employeeName = (id: string) => employees.find((e: any) => e.id === id)?.name ?? "—";
  const locationName = (id?: string) => locations.find((l: any) => l.id === id)?.name ?? "—";
  const myInvites = coverage.filter((c: any) => c.candidates.some((cand: any) => cand.userId === currentUser.id));

  return (
    <div className="view-stack">
      <div className="view-heading"><div><span className="view-kicker">CHAT Y COBERTURA AUTOMÁTICA</span><h2>Cobertura resuelta sin llamadas</h2><p>El sistema invita a quien está disponible; el primero en aceptar se queda con el turno.</p></div><span className="live-pill"><i /> Automatización activa</span></div>

      {currentUser.role !== "employee" && (
        <article className="data-card" style={{ marginBottom: 6 }}>
          <div className="card-heading"><div><h3>Turnos sin cubrir</h3><p>Abre una solicitud de cobertura para avisar al equipo disponible.</p></div></div>
          {openShifts.length === 0 ? <p className="empty-state">No hay turnos abiertos ahora mismo.</p> : openShifts.map((shift: any) => (
            <div className="transfer-route-row" key={shift.id}>
              <div className="person-summary"><span><strong>{locationName(shift.locationId)}</strong><small>{shift.date} · {shift.startTime}–{shift.endTime}</small></span></div>
              <button className="row-action" onClick={() => onOpenCoverage(shift.id)}><Send size={13} /> Pedir cobertura</button>
            </div>
          ))}
        </article>
      )}

      <div className="coverage-layout">
        <section className="chat-card" style={{ gridColumn: "1 / -1" }}>
          <div className="chat-head"><div><span className="chat-logo"><Sparkles size={16} /></span><span><strong>Solicitudes de cobertura</strong><small>{coverage.filter((c: any) => c.status === "open").length} abiertas</small></span></div></div>
          <div className="candidate-list">
            {(currentUser.role === "employee" ? myInvites : coverage).map((request: any) => (
              <article className={`candidate-message ${request.status === "closed" ? "locked" : ""}`} key={request.id}>
                <span className="avatar violet"><AlertTriangle size={15} /></span>
                <div>
                  <strong>{request.shift ? `${locationName(request.shift.locationId)} · ${request.shift.date}` : "Turno"}</strong>
                  <span>{request.shift ? `${request.shift.startTime}–${request.shift.endTime}` : ""} · {request.reason}</span>
                  <p>{request.status === "closed" ? `Cubierto por ${employeeName(request.acceptedByUserId)}` : `${request.candidates.filter((c: any) => c.status === "invited").length} personas invitadas`}</p>
                </div>
                {currentUser.role === "employee" && request.status === "open" && request.candidates.some((c: any) => c.userId === currentUser.id && c.status === "invited") && (
                  <button onClick={() => onAccept(request.id)}>Aceptar turno</button>
                )}
                {request.status === "closed" && <button disabled><LockKeyhole size={13} /> Cerrado</button>}
              </article>
            ))}
            {coverage.length === 0 && <p className="empty-state">No hay solicitudes de cobertura todavía.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}

/* ---------------- Personal (directorio) ---------------- */
export function StaffDirectoryView({ employees, locations }: any) {
  const [query, setQuery] = useState("");
  const locationName = (id: string | null) => locations.find((l: any) => l.id === id)?.name ?? "Sin local";
  const filtered = employees.filter((p: any) => `${p.name} ${p.occupation}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="view-stack">
      <div className="view-heading"><div><span className="view-kicker">DIRECTORIO DE PERSONAL</span><h2>Todos los compañeros</h2><p>Teléfono, correo, ocupación y local actual.</p></div><label className="directory-search"><Search size={15} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar personal" /></label></div>
      <section className="directory-grid">
        {filtered.map((person: any) => (
          <article className="person-card" key={person.id}>
            <div className={`avatar profile-avatar ${person.color}`}>{initials(person.name)}</div>
            <div className="person-card-head"><div><h3>{person.name}</h3><span>{person.occupation}</span></div></div>
            <div className="person-contact"><span><Phone size={13} /> {person.phone || "—"}</span><span><Mail size={13} /> {person.email}</span><span><Building2 size={13} /> {locationName(person.currentLocationId)}</span></div>
          </article>
        ))}
        {filtered.length === 0 && <p className="empty-state">Sin resultados.</p>}
      </section>
    </div>
  );
}

/* ---------------- Locales ---------------- */
export function LocationsView({ locations, employees, currentUser, onCreate, onOpenStaff }: any) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  return (
    <div className="view-stack">
      <div className="view-heading"><div><span className="view-kicker">LOCALES</span><h2>{locations.length} locales</h2><p>Quién está asignado a cada local.</p></div>
        {currentUser.role !== "employee" && <button className="primary-button" onClick={() => setCreating(true)}><Store size={16} /> Nuevo local</button>}
      </div>
      <section className="locations-grid">
        {locations.map((site: any) => {
          const staff = employees.filter((e: any) => (e.currentLocationId ?? e.homeLocationId) === site.id);
          return (
            <article className="location-card" key={site.id}>
              <div className="location-card-head"><span><Store size={20} /></span><div><h3>{site.name}</h3><p>{site.address || "Sin dirección"}</p></div></div>
              <div className="location-hours"><Clock3 size={14} /> {site.openHours}<em>{staff.length} personas</em></div>
              <div className="onsite-list">{staff.length ? staff.map((person: any) => <div key={person.id}><span className={`avatar ${person.color}`}>{initials(person.name)}</span><span><strong>{person.name}</strong><small>{person.occupation}</small></span></div>) : <p>Sin personal asignado</p>}</div>
              <button className="secondary-button" onClick={onOpenStaff}>Ver equipo <ArrowUpRight size={14} /></button>
            </article>
          );
        })}
        {locations.length === 0 && <p className="empty-state">Todavía no hay locales.</p>}
      </section>

      {creating && (
        <div className="modal-backdrop" onMouseDown={() => setCreating(false)}>
          <section className="ai-modal account-modal" onMouseDown={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setCreating(false)}><X size={18} /></button>
            <div className="modal-orb"><Store size={22} /></div><span className="modal-kicker">NUEVO LOCAL</span><h2>Crear local</h2>
            <div className="transfer-form"><label><span>Nombre</span><input value={name} onChange={(e) => setName(e.target.value)} /></label></div>
            <div className="modal-account-actions"><button className="secondary-button" onClick={() => setCreating(false)}>Cancelar</button><button className="primary-button" disabled={!name.trim()} onClick={() => { onCreate(name.trim()); setCreating(false); setName(""); }}>Crear local</button></div>
          </section>
        </div>
      )}
    </div>
  );
}

/* ---------------- Cuentas ---------------- */
export function AccountsView({ employees, locations, currentUser, onCreate, onDelete }: any) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("employee");
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  return (
    <div className="view-stack">
      <div className="view-heading"><div><span className="view-kicker">ADMINISTRACIÓN DE CUENTAS</span><h2>Solo managers y propietarios pueden crear usuarios</h2><p>Los managers no pueden eliminar propietarios.</p></div><button className="primary-button" onClick={() => { setCreating(true); setTempPassword(null); }}><UserPlus size={16} /> Crear cuenta</button></div>
      <article className="data-card accounts-card">
        <div className="account-row table-head"><span>USUARIO</span><span>ACCESO</span><span>LOCAL</span><span /></div>
        {employees.map((account: any) => {
          const protectedOwner = currentUser.role === "manager" && account.role === "owner";
          const isSelf = account.id === currentUser.id;
          return (
            <div className="account-row table-row" key={account.id}>
              <span className="person-summary"><span className={`avatar ${account.color}`}>{initials(account.name)}</span><span><strong>{account.name}</strong><small>{account.email}</small></span></span>
              <em className={`access-pill ${account.role}`}>{account.role === "owner" ? <Crown size={12} /> : account.role === "manager" ? <ShieldCheck size={12} /> : <UserCheck size={12} />}{account.role === "owner" ? "Propietario" : account.role === "manager" ? "Manager" : "Empleado"}</em>
              <span>{locations.find((l: any) => l.id === account.currentLocationId)?.name ?? "—"}</span>
              <span><button className="delete-account" disabled={protectedOwner || isSelf} title={protectedOwner ? "Un manager no puede eliminar propietarios" : isSelf ? "Tu propia cuenta" : "Eliminar cuenta"} onClick={() => onDelete(account.id)}>{protectedOwner || isSelf ? <LockKeyhole size={15} /> : <Trash2 size={15} />}</button></span>
            </div>
          );
        })}
      </article>

      {creating && (
        <div className="modal-backdrop" onMouseDown={() => setCreating(false)}>
          <section className="ai-modal account-modal" onMouseDown={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setCreating(false)}><X size={18} /></button>
            <div className="modal-orb"><UserPlus size={25} /></div><span className="modal-kicker">NUEVA CUENTA</span><h2>Crear usuario</h2>
            {!tempPassword ? (
              <>
                <div className="transfer-form">
                  <label><span>Nombre completo</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
                  <label><span>Correo electrónico</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
                  <label><span>Acceso</span><select value={role} onChange={(e) => setRole(e.target.value)}><option value="employee">Empleado</option><option value="manager">Manager</option>{currentUser.role === "owner" && <option value="owner">Propietario</option>}</select></label>
                  <label><span>Local</span><select value={locationId} onChange={(e) => setLocationId(e.target.value)}>{locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
                </div>
                <div className="modal-account-actions">
                  <button className="secondary-button" onClick={() => setCreating(false)}>Cancelar</button>
                  <button className="primary-button" disabled={!name.trim() || !email.trim()} onClick={async () => { const pwd = await onCreate({ name, email, role, locationId }); if (pwd) { setTempPassword(pwd); setName(""); setEmail(""); } }}>Crear usuario</button>
                </div>
              </>
            ) : (
              <>
                <p>Cuenta creada. Comparte esta contraseña temporal — no volverá a mostrarse:</p>
                <div className="temp-password-box"><span>Contraseña temporal</span><code>{tempPassword}</code></div>
                <button className="primary-button modal-action" onClick={() => setCreating(false)}>Listo</button>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

/* ---------------- Configuración ---------------- */
export function SettingsView({ permissions, onToggle }: any) {
  const rows: [string, string, string][] = [
    ["approveLeave", "Aprobar vacaciones", "Managers y propietarios"],
    ["moveEmployees", "Trasladar empleados", "Managers y propietarios"],
    ["editPublished", "Editar horarios publicados", "Managers y propietarios"],
    ["overrideAI", "Anular una asignación de la IA", "Solo propietarios"],
  ];
  return (
    <div className="view-stack">
      <div className="view-heading"><div><span className="view-kicker">ADMINISTRACIÓN</span><h2>Permisos</h2><p>Controla qué puede hacer cada rol en tu organización.</p></div></div>
      <section className="data-card permission-card">
        {rows.map(([key, label, detail]) => (
          <div className="permission-row" key={key}><div><strong>{label}</strong><span>{detail}</span></div><button className={`toggle ${permissions[key] ? "on" : ""}`} onClick={() => onToggle(key)} aria-label={label}><i /></button></div>
        ))}
      </section>
    </div>
  );
}

/* ---------------- Modal de traslado ---------------- */
export function TransferModal({ employee, locations, onClose, onConfirm }: any) {
  const [toLocationId, setToLocationId] = useState(locations.find((l: any) => l.id !== employee.currentLocationId)?.id ?? locations[0]?.id ?? "");
  const [type, setType] = useState("temporary");
  const [startDate, setStartDate] = useState(todayISO());
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="ai-modal transfer-modal" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        <div className="modal-orb transfer-orb"><ArrowLeftRight size={25} /></div>
        <span className="modal-kicker">MOVILIDAD INTERNA</span>
        <h2>Trasladar a {employee.name}</h2>
        <p>El local base se conserva en el historial aunque el cambio sea definitivo.</p>
        <div className="transfer-form">
          <label><span>Tipo de traslado</span><select value={type} onChange={(e) => setType(e.target.value)}><option value="temporary">Temporal</option><option value="permanent">Definitivo</option></select></label>
          <label><span>Local de destino</span><select value={toLocationId} onChange={(e) => setToLocationId(e.target.value)}>{locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
          <div className="date-fields"><label><span>Desde</span><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label></div>
        </div>
        <button className="primary-button modal-action" onClick={() => onConfirm(toLocationId, type, startDate)} disabled={!toLocationId}><Check size={16} /> Confirmar traslado</button>
      </section>
    </div>
  );
}
