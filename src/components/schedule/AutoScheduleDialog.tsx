import React, { useState } from "react";
import { z } from "zod";
import { supabase } from "../../lib/supabaseClient";

const NotesSchema = z.object({
  scheduleId: z.string().min(1),
  notesByUser: z.record(z.string(), z.string().max(500)).default({}),
});

export function AutoScheduleDialog({
  scheduleId,
  open,
  onClose,
}: {
  scheduleId: string;
  open: boolean;
  onClose: () => void;
}) {
  const [notesJson, setNotesJson] = useState<string>("{}");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!open) return null;

  const run = async () => {
    setErr(null);
    setBusy(true);
    try {
      const parsed = NotesSchema.parse({ scheduleId, notesByUser: JSON.parse(notesJson) });
      const { data, error } = await supabase.functions.invoke("auto_schedule", { body: parsed });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      onClose();
    } catch (e: any) {
      setErr(e?.message ?? "Unknown error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-xl rounded bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Auto-schedule</h2>
          <button className="rounded px-2 py-1 text-sm hover:bg-gray-100" onClick={onClose}>Close</button>
        </div>

        <p className="mt-2 text-sm text-gray-600">
          Optional per-user notes as JSON map: {"{ "user_uuid": "mornings only" }"}
        </p>

        <textarea
          className="mt-3 h-40 w-full rounded border p-2 font-mono text-sm"
          value={notesJson}
          onChange={(e) => setNotesJson(e.target.value)}
        />

        {err && <div className="mt-2 rounded bg-red-50 p-2 text-sm text-red-700">{err}</div>}

        <div className="mt-4 flex justify-end gap-2">
          <button className="rounded border px-3 py-2 text-sm hover:bg-gray-50" onClick={onClose}>Cancel</button>
          <button
            className="rounded bg-gray-900 px-3 py-2 text-sm text-white hover:bg-black disabled:opacity-60"
            disabled={busy}
            onClick={run}
          >
            {busy ? "Running…" : "Run auto-schedule"}
          </button>
        </div>
      </div>
    </div>
  );
}
