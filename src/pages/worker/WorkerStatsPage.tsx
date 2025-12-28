import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

export function WorkerStatsPage() {
  const orgId = localStorage.getItem("easyshift.activeOrgId");
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    (async () => {
      if (!orgId) return;
      const { data, error } = await supabase.rpc("my_stats_current_and_history", { p_org_id: orgId });
      if (error) console.error(error);
      setStats(data);
    })();
  }, [orgId]);

  return (
    <div className="rounded bg-white p-6 shadow">
      <h1 className="text-xl font-semibold">My Stats</h1>
      <p className="mt-2 text-sm text-gray-600">Shift breakdown for current schedule + history.</p>
      <pre className="mt-4 overflow-auto rounded bg-gray-50 p-3 text-xs">{JSON.stringify(stats, null, 2)}</pre>
      <p className="mt-2 text-xs text-gray-500">
        This page is intentionally minimal for review. You can replace JSON with charts later.
      </p>
    </div>
  );
}
