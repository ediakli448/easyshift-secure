import React, { useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { z } from "zod";
import { useNavigate } from "react-router-dom";

const Schema = z.object({
  name: z.string().min(2),
  timezone: z.string().min(1).default("Asia/Jerusalem"),
  weekStart: z.string().default("Sunday"),
  shiftChangeTime: z.string().regex(/^\d{2}:\d{2}$/).default("15:00"),
  openingHours: z.any(),
  defaultRequirements: z.any(),
});

export function CreateOrgPage() {
  const nav = useNavigate();
  const [name, setName] = useState("My Vet Clinic");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const create = async () => {
    setBusy(true);
    setErr(null);
    try {
      const payload = Schema.parse({
        name,
        timezone: "Asia/Jerusalem",
        weekStart: "Sunday",
        shiftChangeTime: "15:00",
        openingHours: {
          "Sun-Thu": { open: "09:00", close: "21:00" },
          "Fri": { open: "09:00", close: "14:00" },
          "Sat": "closed",
        },
        defaultRequirements: {
          morning: { VET: 1, ASSISTANT: 2 },
          evening: { VET: 1, ASSISTANT: 2 },
        },
      });

      const { data, error } = await supabase.functions.invoke("create_org", { body: payload });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      localStorage.setItem("easyshift.activeOrgId", data.org_id);
      localStorage.setItem("easyshift.activeOrgRole", "ADMIN");
      nav("/admin");
    } catch (e: any) {
      setErr(e?.message ?? "Failed to create org");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl rounded bg-white p-6 shadow">
      <h1 className="text-xl font-semibold">Create organization</h1>
      <p className="mt-2 text-sm text-gray-600">Set up your clinic tenant.</p>

      <label className="mt-4 block text-sm font-medium">Organization name</label>
      <input className="mt-1 w-full rounded border p-2" value={name} onChange={(e) => setName(e.target.value)} />

      {err && <div className="mt-3 rounded bg-red-50 p-2 text-sm text-red-700">{err}</div>}

      <button
        className="mt-5 rounded bg-gray-900 px-3 py-2 text-sm text-white hover:bg-black disabled:opacity-60"
        disabled={busy}
        onClick={() => void create()}
      >
        {busy ? "Creating…" : "Create"}
      </button>
    </div>
  );
}
