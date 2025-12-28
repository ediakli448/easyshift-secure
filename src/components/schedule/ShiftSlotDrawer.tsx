import React from "react";
import { StaffRole } from "../../lib/types";

export type Candidate = {
  user_id: string;
  name: string;
  email: string;
  staff_role: StaffRole;
  current_count: number;
  percent_within_role: number;
  preferred: "MORNING" | "EVENING" | "NONE";
  note: string | null;
};

export function ShiftSlotDrawer({
  open,
  onClose,
  title,
  candidates,
  onAssign,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  candidates: Candidate[];
  onAssign: (userId: string) => Promise<void>;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-stretch justify-end bg-black/30">
      <div className="w-full max-w-md bg-white p-4 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button className="rounded px-2 py-1 text-sm hover:bg-gray-100" onClick={onClose}>Close</button>
        </div>

        <div className="mt-3 space-y-2 overflow-auto">
          {candidates.length === 0 && (
            <div className="rounded border bg-gray-50 p-3 text-sm text-gray-700">
              No eligible candidates (based on constraints / role).
            </div>
          )}

          {candidates.map((c) => (
            <div key={c.user_id} className="rounded border p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">{c.name || c.email}</div>
                  <div className="text-xs text-gray-600">{c.staff_role} • {c.current_count} shifts • {c.percent_within_role.toFixed(0)}%</div>
                </div>
                <button
                  className="rounded bg-gray-900 px-2 py-1 text-xs text-white hover:bg-black"
                  onClick={() => void onAssign(c.user_id)}
                >
                  Assign
                </button>
              </div>
              <div className="mt-2 text-xs text-gray-700">
                Pref: {c.preferred}{c.note ? ` • Note: ${c.note}` : ""}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
