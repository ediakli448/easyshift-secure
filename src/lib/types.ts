export type OrgRole = "ADMIN" | "WORKER";
export type StaffRole = "VET" | "ASSISTANT";

export type ScheduleStatus = "DRAFT" | "LOCKED" | "PUBLISHED" | "ARCHIVED";
export type ShiftLabel = "MORNING" | "EVENING";
export type ConstraintType = "ALL_DAY" | "MORNING_ONLY" | "EVENING_ONLY" | "NONE";
export type PreferredShift = "MORNING" | "EVENING" | "NONE";

export interface OrgMembership {
  org_id: string;
  role: OrgRole;
  staff_role: StaffRole | null;
  org_name: string;
}

export interface Schedule {
  id: string;
  org_id: string;
  title: string;
  start_date: string; // YYYY-MM-DD
  end_date: string;   // YYYY-MM-DD
  submission_deadline: string | null; // ISO
  status: ScheduleStatus;
  published_at: string | null;
}

export interface Shift {
  id: string;
  schedule_id: string;
  org_id: string;
  date: string; // YYYY-MM-DD
  label: ShiftLabel;
  start_time: string; // HH:mm
  end_time: string;   // HH:mm
  requirements: { VET: number; ASSISTANT: number };
}
