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
