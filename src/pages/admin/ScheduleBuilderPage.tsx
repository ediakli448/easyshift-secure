import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import type { Schedule, Shift } from "../../lib/types";
import { CalendarGrid } from "../../components/calendar/CalendarGrid";
import { AutoScheduleDialog } from "../../components/schedule/AutoScheduleDialog";
import { ShiftSlotDrawer, Candidate } from "../../components/schedule/ShiftSlotDrawer";

export function ScheduleBuilderPage() {
  const orgId = localStorage.getItem("easyshift.activeOrgId");
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [openAuto, setOpenAuto] = useState(false);

  const [drawer, setDrawer] = useState<{ open: boolean; shiftId: string; role: "VET" | "ASSISTANT"; slotIndex: number; date: string; label: string } | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);

  const load = async () => {
    if (!orgId) return;
    // active schedule = latest non-archived
    const { data: s } = await supabase.from("schedules").select("*").eq("org_id", orgId).neq("status", "ARCHIVED").order("created_at", { ascending: false }).limit(1).maybeSingle();
    setSchedule(s ?? null);
    if (!s?.id) return;

    const { data: sh } = await supabase.from("shifts").select("*").eq("schedule_id", s.id).order("date").order("label");
    setShifts((sh ?? []).map((x: any) => ({ ...x, requirements: x.requirements ?? { VET: 1, ASSISTANT: 2 } })));

    const { data: asg } = await supabase.from("assignments").select("*").eq("schedule_id", s.id);
    setAssignments(asg ?? []);
  };

  useEffect(() => { void load(); }, [orgId]);

  const byDate = useMemo(() => {
    const map = new Map<string, Shift[]>();
    for (const sh of shifts) {
      const arr = map.get(sh.date) ?? [];
      arr.push(sh);
      map.set(sh.date, arr);
    }
    return map;
  }, [shifts]);

  const openSlot = async (shift: Shift, role: "VET" | "ASSISTANT", slotIndex: number) => {
    setDrawer({ open: true, shiftId: shift.id, role, slotIndex, date: shift.date, label: shift.label });
    // Fetch eligible candidates from RPC (server-side) to avoid IDOR issues.
    const { data, error } = await supabase.rpc("eligible_candidates_for_shift_slot", {
      p_shift_id: shift.id,
      p_role: role,
    });
    if (error) console.error(error);
    setCandidates((data ?? []) as Candidate[]);
  };

  const assign = async (userId: string) => {
    if (!drawer || !schedule) return;
    const { data, error } = await supabase.functions.invoke("assign_manual", {
      body: {
        scheduleId: schedule.id,
        shiftId: drawer.shiftId,
        role: drawer.role,
        userId,
      }
    });
    if (error) alert(error.message);
    if (data?.error) alert(data.error);
    setDrawer(null);
    await load();
  };

  const lock = async () => {
    if (!schedule) return;
    const { data, error } = await supabase.functions.invoke("lock_submissions", { body: { scheduleId: schedule.id } });
    if (error) alert(error.message);
    if (data?.error) alert(data.error);
    await load();
  };

  const publish = async () => {
    if (!schedule) return;
    const { data, error } = await supabase.functions.invoke("publish_schedule", { body: { scheduleId: schedule.id } });
    if (error) alert(error.message);
    if (data?.error) alert(data.error);
    await load();
  };

  if (!schedule) {
    return (
      <div className="rounded bg-white p-6 shadow">
        <h1 className="text-xl font-semibold">Schedule Builder</h1>
        <p className="mt-2 text-sm text-gray-600">No schedule exists yet. Create one from Organization Settings (extend this UI).</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded bg-white p-6 shadow">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold">Schedule Builder</h1>
            <div className="mt-1 text-sm text-gray-600">{schedule.title} • {schedule.status}</div>
          </div>

          <div className="flex gap-2">
            <button className="rounded border px-3 py-2 text-sm hover:bg-gray-50" onClick={() => setOpenAuto(true)}>
              Auto-Assign
            </button>
            <button className="rounded border px-3 py-2 text-sm hover:bg-gray-50" onClick={() => void lock()}>
              Lock Submissions
            </button>
            <button className="rounded bg-gray-900 px-3 py-2 text-sm text-white hover:bg-black" onClick={() => void publish()}>
              Publish
            </button>
          </div>
        </div>
      </div>

      <div className="rounded bg-white p-6 shadow">
        <CalendarGrid
          startDate={schedule.start_date}
          endDate={schedule.end_date}
          renderDay={(d) => {
            const dayShifts = byDate.get(d) ?? [];
            return (
              <div className="space-y-2">
                {dayShifts.map((sh) => {
                  const req = sh.requirements;
                  const assigned = assignments.filter((a) => a.shift_id === sh.id);
                  const vetAssigned = assigned.filter((a) => a.role === "VET");
                  const asAssigned = assigned.filter((a) => a.role === "ASSISTANT");

                  const renderSlots = (role: "VET" | "ASSISTANT", needed: number, current: any[]) => {
                    const slots = Array.from({ length: needed }).map((_, i) => {
                      const a = current[i];
                      return (
                        <button
                          key={i}
                          className="flex w-full items-center justify-between rounded border px-2 py-1 text-xs hover:bg-gray-50"
                          onClick={() => void openSlot(sh, role, i)}
                        >
                          <span>{role} #{i + 1}</span>
                          <span className="text-gray-700">{a?.user_id ? "Assigned" : "Empty"}</span>
                        </button>
                      );
                    });
                    return <div className="space-y-1">{slots}</div>;
                  };

                  return (
                    <div key={sh.id} className="rounded border p-2">
                      <div className="mb-2 flex items-center justify-between">
                        <div className="text-sm font-medium">{sh.label}</div>
                        <div className="text-xs text-gray-600">{sh.start_time}–{sh.end_time}</div>
                      </div>
                      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                        <div>
                          <div className="mb-1 text-xs font-medium text-gray-600">Vets</div>
                          {renderSlots("VET", req.VET, vetAssigned)}
                        </div>
                        <div>
                          <div className="mb-1 text-xs font-medium text-gray-600">Assistants</div>
                          {renderSlots("ASSISTANT", req.ASSISTANT, asAssigned)}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {dayShifts.length === 0 && <div className="text-xs text-gray-500">No shifts.</div>}
              </div>
            );
          }}
        />
      </div>

      <AutoScheduleDialog scheduleId={schedule.id} open={openAuto} onClose={() => { setOpenAuto(false); void load(); }} />

      <ShiftSlotDrawer
        open={!!drawer?.open}
        onClose={() => setDrawer(null)}
        title={drawer ? `${drawer.date} • ${drawer.label} • ${drawer.role}` : ""}
        candidates={candidates}
        onAssign={assign}
      />
    </div>
  );
}
