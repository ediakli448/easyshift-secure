import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export function NotificationsPage() {
  const orgId = localStorage.getItem("easyshift.activeOrgId");
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      if (!orgId) return;
      const { data, error } = await supabase.from("notifications").select("*").eq("org_id", orgId).order("created_at", { ascending: false }).limit(50);
      if (error) console.error(error);
      setItems(data ?? []);
    })();
  }, [orgId]);

  return (
    <div className="rounded bg-white p-6 shadow">
      <h1 className="text-xl font-semibold">Notifications</h1>
      <div className="mt-4 space-y-2">
        {items.map((n) => (
          <div key={n.id} className="rounded border p-3">
            <div className="text-sm font-medium">{n.type}</div>
            <div className="mt-1 text-xs text-gray-600">{new Date(n.created_at).toLocaleString()}</div>
            <pre className="mt-2 overflow-auto rounded bg-gray-50 p-2 text-xs">{JSON.stringify(n.payload, null, 2)}</pre>
          </div>
        ))}
        {items.length === 0 && <div className="text-sm text-gray-600">No notifications.</div>}
      </div>
    </div>
  );
}
