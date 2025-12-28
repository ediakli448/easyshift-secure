import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { z } from "zod";

const AcceptSchema = z.object({ token: z.string().min(10) });

export function JoinOrgPage() {
  const { token } = useParams();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setErr(null);
  }, [token]);

  const accept = async () => {
    setBusy(true);
    setErr(null);
    try {
      const parsed = AcceptSchema.parse({ token });
      const { data, error } = await supabase.functions.invoke("accept_invite", { body: parsed });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      // Set active org from response
      localStorage.setItem("easyshift.activeOrgId", data.org_id);
      localStorage.setItem("easyshift.activeOrgRole", "WORKER");
      nav("/worker/constraints");
    } catch (e: any) {
      setErr(e?.message ?? "Failed to accept invite");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl rounded bg-white p-6 shadow">
      <h1 className="text-xl font-semibold">Join organization</h1>
      <p className="mt-2 text-sm text-gray-600">Accept the invite to join this clinic.</p>
      {err && <div className="mt-3 rounded bg-red-50 p-2 text-sm text-red-700">{err}</div>}
      <button
        className="mt-5 rounded bg-gray-900 px-3 py-2 text-sm text-white hover:bg-black disabled:opacity-60"
        disabled={busy}
        onClick={() => void accept()}
      >
        {busy ? "Joining…" : "Accept invite"}
      </button>
    </div>
  );
}
