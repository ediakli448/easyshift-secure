import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

export function SwapApprovalsPage() {
  const orgId = localStorage.getItem("easyshift.activeOrgId");
  const [items, setItems] = useState<any[]>([]);

  const load = async () => {
    if (!orgId) return;
    const { data, error } = await supabase
      .from("swap_requests")
      .select("*, swap_offers(*)")
      .eq("org_id", orgId)
      .eq("status", "ADMIN_APPROVAL")
      .order("created_at", { ascending: true });
    if (error) console.error(error);
    setItems(data ?? []);
  };

  useEffect(() => { void load(); }, [orgId]);

  const approve = async (swapRequestId: string, offerId: string) => {
    const { data, error } = await supabase.functions.invoke("approve_swap", { body: { swapRequestId, offerId } });
    if (error) alert(error.message);
    if (data?.error) alert(data.error);
    await load();
  };

  const reject = async (swapRequestId: string) => {
    const { data, error } = await supabase.functions.invoke("reject_swap", { body: { swapRequestId } });
    if (error) alert(error.message);
    if (data?.error) alert(data.error);
    await load();
  };

  return (
    <div className="rounded bg-white p-6 shadow">
      <h1 className="text-xl font-semibold">Swap Approvals</h1>
      <p className="mt-2 text-sm text-gray-600">Approve swaps requested by workers.</p>

      <div className="mt-4 space-y-3">
        {items.map((it) => (
          <div key={it.id} className="rounded border p-3">
            <div className="text-sm font-medium">Swap request #{it.id.slice(0, 8)}</div>
            <div className="mt-1 text-xs text-gray-600">Shift: {it.shift_id}</div>

            <div className="mt-2 text-xs text-gray-700">Offers:</div>
            <div className="mt-2 space-y-2">
              {(it.swap_offers ?? []).map((o: any) => (
                <div key={o.id} className="flex items-center justify-between rounded border p-2">
                  <span className="text-xs">{o.offer_user_id}</span>
                  <button className="rounded bg-gray-900 px-2 py-1 text-xs text-white hover:bg-black"
                          onClick={() => void approve(it.id, o.id)}>
                    Approve this offer
                  </button>
                </div>
              ))}
            </div>

            <button className="mt-3 rounded border px-3 py-2 text-sm hover:bg-gray-50" onClick={() => void reject(it.id)}>
              Reject request
            </button>
          </div>
        ))}

        {items.length === 0 && <div className="text-sm text-gray-600">No swaps pending approval.</div>}
      </div>
    </div>
  );
}
