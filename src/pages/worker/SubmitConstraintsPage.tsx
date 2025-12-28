import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import type { Schedule, ConstraintType, PreferredShift } from "../../lib/types";
import { CalendarGrid } from "../../components/calendar/CalendarGrid";

type ConstraintRow = {
  id?: string;
  date: string;
  type: ConstraintType;
  preferred: PreferredShift;
  note: string;
};

export function SubmitConstraintsPage() {
  const orgId = localStorage.getItem("easyshift.activeOrgId");
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [rows, setRows] = useState<Record<string, ConstraintRow>>({});
  const [saving, setSaving] = useState(false);

  const locked = useMemo(() => {
    if (!schedule) return true;
    if (schedule.status === "LOCKED" || schedule.status === "PUBLISHED") return true;
    if (schedule.submission_deadline) {
      const now = new Date();
      const dl = new Date(schedule.submission_deadline);
      return now > dl;
    }
    return false;
  }, [schedule]);

  useEffect(() => {
    (async () => {
      if (!orgId) return;
      const { data: s } = await supabase.from("schedules").select("*").eq("org_id", orgId).neq("status", "ARCHIVED").order("created_at", { ascending: false }).limit(1).maybeSingle();
      setSchedule(s ?? null);
      if (!s?.id) return;

      const { data: c } = await supabase.from("constraints").select("*").eq("schedule_id", s.id);
      const map: Record<string, ConstraintRow> = {};
      for (const r of c ?? []) {
        map[r.date] = { id: r.id, date: r.date, type: r.type, preferred: r.preferred ?? "NONE", note: r.note ?? "" };
      }
      setRows(map);
    })();
  }, [orgId]);

  const setForDate = (date: string, patch: Partial<ConstraintRow>) => {
    setRows((prev) => {
      const existing = prev[date] ?? { date, type: "NONE", preferred: "NONE", note: "" };
      return { ...prev, [date]: { ...existing, ...patch } as ConstraintRow };
    });
  };

  const save = async () => {
    if (!schedule) return;
    setSaving(true);
    try {
      const payload = Object.values(rows).map((r) => ({
        schedule_id: schedule.id,
        org_id: schedule.org_id,
        date: r.date,
        type: r.type,
        preferred: r.preferred,
        note: r.note,
      }));

      // Upsert is allowed by RLS only for the current user (user_id from auth.uid()) via DB trigger.
      const { data, error } = await supabase.functions.invoke("upsert_constraints", {
        body: { scheduleId: schedule.id, items: payload },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      alert("Saved");
    } catch (e: any) {
      alert(e?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (!schedule) {
    return (
      <div className="rounded bg-white p-6 shadow">
        <h1 className="text-xl font-semibold">Submit Constraints</h1>
        <p className="mt-2 text-sm text-gray-600">No active schedule yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded bg-white p-6 shadow">
        <h1 className="text-xl font-semibold">Submit Constraints</h1>
        <div className="mt-1 text-sm text-gray-600">
          {schedule.title} • {locked ? "Locked" : "Open"}
        </div>
        {schedule.submission_deadline && (
          <div className="mt-1 text-xs text-gray-600">Deadline: {schedule.submission_deadline}</div>
        )}
      </div>

      <div className="rounded bg-white p-6 shadow">
        <CalendarGrid
          startDate={schedule.start_date}
          endDate={schedule.end_date}
          renderDay={(d) => {
            const row = rows[d] ?? { date: d, type: "NONE", preferred: "NONE", note: "" };
            return (
              <div className="space-y-2">
                <select
                  className="w-full rounded border p-2 text-sm"
                  disabled={locked}
                  value={row.type}
                  onChange={(e) => setForDate(d, { type: e.target.value as any })}
                >
                  <option value="NONE">No constraint</option>
                  <option value="ALL_DAY">Unavailable all day</option>
                  <option value="MORNING_ONLY">Unavailable morning</option>
                  <option value="EVENING_ONLY">Unavailable evening</option>
                </select>

                <select
                  className="w-full rounded border p-2 text-sm"
                  disabled={locked}
                  value={row.preferred}
                  onChange={(e) => setForDate(d, { preferred: e.target.value as any })}
                >
                  <option value="NONE">No preference</option>
                  <option value="MORNING">Prefer morning</option>
                  <option value="EVENING">Prefer evening</option>
                </select>

                <input
                  className="w-full rounded border p-2 text-sm"
                  disabled={locked}
                  placeholder="Note (optional)"
                  value={row.note}
                  onChange={(e) => setForDate(d, { note: e.target.value })}
                />
              </div>
            );
          }}
        />

        <div className="mt-4 flex justify-end">
          <button
            disabled={locked || saving}
            className="rounded bg-gray-900 px-3 py-2 text-sm text-white hover:bg-black disabled:opacity-60"
            onClick={() => void save()}
          >
            {saving ? "Saving…" : "Submit / Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
