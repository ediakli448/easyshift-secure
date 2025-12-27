import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

export function WorkerSwapsPage() {
  const orgId = localStorage.getItem("easyshift.activeOrgId");
  const [scheduleId, setScheduleId] = useState<string | null>(null);
  const [myAssignments, setMyAssignments] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);

  const load = async () => {
    if (!orgId) return;
    const { data: s } = await supabase.from("schedules").select("*").eq("org_id", orgId).eq("status", "PUBLISHED").order("published_at", { ascending: false }).limit(1).maybeSingle();
    if (!s?.id) return;
    setScheduleId(s.id);

    const { data: a } = await supabase.rpc("my_assignments_for_schedule", { p_schedule_id: s.id });
    setMyAssignments(a ?? []);

    const { data: r } = await supabase.from("swap_requests").select("*, swap_offers(*)").eq("org_id", orgId).eq("schedule_id", s.id).order("created_at", { ascending: false });
    setRequests(r ?? []);
  };

  useEffect(() => { void load(); }, [orgId]);

  const requestSwap = async (assignmentId: string) => {
    const { data, error } = await supabase.functions.invoke("request_swap", { body: { assignmentId } });
    if (error) alert(error.message);
    if (data?.error) alert(data.error);
    await load();
  };

  const offerSwap = async (swapRequestId: string) => {
    const { data, error } = await supabase.functions.invoke("offer_swap", { body: { swapRequestId } });
    if (error) alert(error.message);
    if (data?.error) alert(data.error);
    await load();
  };

  if (!scheduleId) {
    return (
      <div className="rounded bg-white p-6 shadow">
        <h1 className="text-xl font-semibold">Swaps</h1>
        <p className="mt-2 text-sm text-gray-600">No published schedule yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded bg-white p-6 shadow">
        <h1 className="text-xl font-semibold">My Shifts</h1>
        <p className="mt-2 text-sm text-gray-600">Request swaps for your assigned shifts.</p>
        <div className="mt-4 space-y-2">
          {myAssignments.map((a) => (
            <div key={a.assignment_id} className="flex items-center justify-between rounded border p-3">
              <div className="text-sm">
                <div className="font-medium">{a.date} • {a.label}</div>
                <div className="text-xs text-gray-600">{a.role} • shift {a.shift_id}</div>
              </div>
              <button className="rounded border px-3 py-2 text-sm hover:bg-gray-50" onClick={() => void requestSwap(a.assignment_id)}>
                Request swap
              </button>
            </div>
          ))}
          {myAssignments.length === 0 && <div className="text-sm text-gray-600">No assignments.</div>}
        </div>
      </div>

      <div className="rounded bg-white p-6 shadow">
        <h2 className="text-lg font-semibold">Open swap requests</h2>
        <div className="mt-4 space-y-2">
          {requests.map((r) => (
            <div key={r.id} className="rounded border p-3">
              <div className="text-sm font-medium">Request #{r.id.slice(0, 8)} • {r.status}</div>
              <div className="mt-1 text-xs text-gray-600">Shift: {r.shift_id}</div>
              <button className="mt-3 rounded bg-gray-900 px-3 py-2 text-sm text-white hover:bg-black" onClick={() => void offerSwap(r.id)}>
                Offer to take this shift
              </button>
            </div>
          ))}
          {requests.length === 0 && <div className="text-sm text-gray-600">No swap requests.</div>}
        </div>
      </div>
    </div>
  );
}
