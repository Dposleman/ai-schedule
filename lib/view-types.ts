// Shared shapes for the data AppShell loads from the API and hands down to
// the view components in app-shell-views.tsx. Both files import from here
// instead of each declaring (or worse, `any`-typing) their own copy, so a
// schema change only needs to be reflected in one place.
import type { Lang } from "@/lib/i18n";

export type Role = "owner" | "manager" | "employee";

export type CurrentUser = {
  id: string; orgId: string; name: string; email: string; role: Role;
  occupation: string; phone: string; color: string;
  homeLocationId: string | null; currentLocationId: string | null;
  language: Lang;
};

// budgetCents is management-only: GET /api/locations omits it for
// employee-role callers (see app/api/locations/route.ts).
export type LocationT = {
  id: string; name: string; address: string; openHours: string;
  latitude: number; longitude: number; radiusMeters: number; budgetCents?: number;
  logoUrl: string | null;
  // 0 until an owner/manager confirms the coordinates (see
  // app/api/locations/route.ts) — GPS check-in is refused server-side until
  // then (app/api/attendance/route.ts), so the UI surfaces this instead of
  // letting staff hit a silent check-in failure.
  verified: number;
};

export type OrgT = { id: string; name: string; logoUrl: string | null };

// hourlyRateCents/weeklyHourTarget are management-only data: GET
// /api/employees now omits them entirely for employee-role callers (see
// app/api/employees/route.ts), so they're optional here rather than
// guaranteed present.
export type EmployeeT = {
  id: string; name: string; email: string; role: Role; occupation: string; phone: string;
  color: string; homeLocationId: string | null; currentLocationId: string | null;
  hourlyRateCents?: number; weeklyHourTarget?: number;
};

export type ShiftT = {
  id: string; locationId: string; userId: string | null; date: string;
  startTime: string; endTime: string; role: string; status: string; published: number; aiGenerated: number;
};

export type AbsenceT = { id: string; userId: string; type: string; startDate: string; endDate: string; status: string; note: string };
export type TransferT = { id: string; userId: string; fromLocationId: string; toLocationId: string; type: string; startDate: string; endDate: string | null; status: string };
export type TaskT = { id: string; locationId: string; name: string; ownerUserId: string | null; dueTime: string; date: string; automatic: number; completed: number };
export type CoverageCandidateT = { id: string; requestId: string; userId: string; matchScore: number; status: string };
export type CoverageRequestT = { id: string; shiftId: string; reason: string; status: string; acceptedByUserId: string | null; shift: ShiftT | null; candidates: CoverageCandidateT[] };
export type PermissionsT = { approveLeave: number; moveEmployees: number; editPublished: number; overrideAI: number };
export type NotificationT = { id: string; type: string; title: string; body: string; entityId: string | null; readAt: string | null; createdAt: string };

// The one shape used only inside app-shell-views.tsx (TimeTrackingView's
// open attendance record) — kept here too so it's typed instead of `any`.
export type OpenAttendanceT = { id: string; checkInAt: string; checkOutAt: string | null };

// GET /api/attendance/today — org-wide, for Overview's staffing/exceptions
// panel. shiftId is null for a clock-in that wasn't tied to a scheduled
// shift (see app/api/attendance/route.ts).
export type TodayAttendanceT = { id: string; userId: string; shiftId: string | null; checkInAt: string | null; checkOutAt: string | null };

// GET /api/attendance/timesheet — manager/owner only (capability
// attendance.manage). One row per attendance record in the requested week,
// with the matching shift's scheduled date/time when the check-in was tied
// to one (see app/api/attendance/timesheet/route.ts).
export type TimesheetRowT = {
  id: string; userId: string; userName: string;
  shiftId: string | null; shiftDate: string | null; shiftStart: string | null; shiftEnd: string | null; shiftLocationId: string | null;
  checkInAt: string | null; checkOutAt: string | null; autoCheckout: number;
  approved: number; approvedBy: string | null; approvedAt: string | null;
};

// GET /api/audit — owner-only (see lib/audit.ts for the AuditAction union).
// actorUserId is null for a system-triggered event (a cron job).
export type AuditEventT = {
  id: string; actorUserId: string | null; actorName: string; action: string;
  entityType: string; entityId: string; metadata: Record<string, unknown>; createdAt: string;
};

// GET /api/billing (see lib/billing.ts / lib/plans.ts).
export type BillingT = {
  planKey: string; subscriptionStatus: string; trialEndsAt: string;
  currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean; gracePeriodEndsAt: string | null;
  seatLimit: number; locationLimit: number; isTrialExpired: boolean; isRestricted: boolean;
  plan: { key: string; name: string; locationLimit: number; seatLimit: number; priceMonthlyCents: number | null; positioning: string };
  catalog: { key: string; name: string; locationLimit: number; seatLimit: number; priceMonthlyCents: number | null; positioning: string }[];
};
