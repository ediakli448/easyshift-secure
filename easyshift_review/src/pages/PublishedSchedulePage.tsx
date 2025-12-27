import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import type { Schedule, Shift } from "../lib/types";
import { CalendarGrid } from "../components/calendar/CalendarGrid";

export function PublishedSchedulePage() {
  const orgId = localStorage.getItem("easyshift.activeOrgId");
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      if (!orgId) return;
      const { data: s } = await supabase.from("schedules").select("*").eq("org_id", orgId).eq("status", "PUBLISHED").order("published_at", { ascending: false }).limit(1).maybeSingle();
      setSchedule(s ?? null);
      if (!s?.id) return;

      const { data: sh } = await supabase.from("shifts").select("*").eq("schedule_id", s.id).order("date").order("label");
      setShifts((sh ?? []).map((x: any) => ({ ...x, requirements: x.requirements ?? { VET: 1, ASSISTANT: 2 } })));

      const { data: asg } = await supabase.from("assignments").select("*").eq("schedule_id", s.id);
      setAssignments(asg ?? []);
    })();
  }, [orgId]);

  const byDate = useMemo(() => {
    const map = new Map<string, Shift[]>();
    for (const sh of shifts) {
      const arr = map.get(sh.date) ?? [];
      arr.push(sh);
      map.set(sh.date, arr);
    }
    return map;
  }, [shifts]);

  if (!schedule) {
    return (
      <div className="rounded bg-white p-6 shadow">
        <h1 className="text-xl font-semibold">Published Schedule</h1>
        <p className="mt-2 text-sm text-gray-600">No published schedule yet.</p>
      </div>
    );
  }

  return (
    <div className="rounded bg-white p-6 shadow">
      <h1 className="text-xl font-semibold">Published Schedule</h1>
      <div className="mt-1 text-sm text-gray-600">{schedule.title}</div>

      <div className="mt-4">
        <CalendarGrid
          startDate={schedule.start_date}
          endDate={schedule.end_date}
          renderDay={(d) => {
            const dayShifts = byDate.get(d) ?? [];
            return (
              <div className="space-y-2">
                {dayShifts.map((sh) => {
                  const assigned = assignments.filter((a) => a.shift_id === sh.id);
                  const vets = assigned.filter((a) => a.role === "VET").map((a) => a.user_id);
                  const assistants = assigned.filter((a) => a.role === "ASSISTANT").map((a) => a.user_id);
                  return (
                    <div key={sh.id} className="rounded border p-2">
                      <div className="text-sm font-medium">{sh.label} <span className="text-xs text-gray-600">{sh.start_time}-{sh.end_time}</span></div>
                      <div className="mt-2 text-xs"><span className="font-medium">Vets:</span> {vets.join(", ") || "—"}</div>
                      <div className="mt-1 text-xs"><span className="font-medium">Assistants:</span> {assistants.join(", ") || "—"}</div>
                    </div>
                  );
                })}
                {dayShifts.length === 0 && <div className="text-xs text-gray-500">No shifts.</div>}
              </div>
            );
          }}
        />
      </div>
    </div>
  );
}
