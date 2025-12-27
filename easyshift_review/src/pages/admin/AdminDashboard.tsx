import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { Link } from "react-router-dom";

export function AdminDashboard() {
  const orgId = localStorage.getItem("easyshift.activeOrgId");
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    (async () => {
      if (!orgId) return;
      const { data, error } = await supabase.rpc("admin_dashboard_stats", { p_org_id: orgId });
      if (error) {
        console.error(error);
        return;
      }
      setStats(data);
    })();
  }, [orgId]);

  if (!orgId) {
    return (
      <div className="rounded bg-white p-6 shadow">
        <p className="text-sm">No active org selected.</p>
        <Link className="text-sm text-blue-600" to="/">Go home</Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded bg-white p-6 shadow">
        <h1 className="text-xl font-semibold">Admin Dashboard</h1>
        <p className="mt-2 text-sm text-gray-600">Quick overview for the active schedule.</p>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded border p-3">
            <div className="text-xs text-gray-600">% constraints submitted</div>
            <div className="text-2xl font-semibold">{stats?.constraints_completion_percent ?? "—"}</div>
          </div>
          <div className="rounded border p-3">
            <div className="text-xs text-gray-600">Unassigned slots</div>
            <div className="text-2xl font-semibold">{stats?.unassigned_slots ?? "—"}</div>
          </div>
          <div className="rounded border p-3">
            <div className="text-xs text-gray-600">Schedule status</div>
            <div className="text-2xl font-semibold">{stats?.schedule_status ?? "—"}</div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link className="rounded bg-gray-900 px-3 py-2 text-sm text-white hover:bg-black" to="/admin/schedule">
            Open Schedule Builder
          </Link>
          <Link className="rounded border px-3 py-2 text-sm hover:bg-gray-50" to="/admin/settings">
            Organization Settings
          </Link>
        </div>
      </div>
    </div>
  );
}
