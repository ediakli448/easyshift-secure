import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useOrg } from "../contexts/OrgContext";
import type { OrgMembership } from "../lib/types";
import { Link, useNavigate } from "react-router-dom";

export function HomeGate() {
  const [loading, setLoading] = useState(true);
  const [memberships, setMemberships] = useState<OrgMembership[]>([]);
  const { setActiveOrgId } = useOrg();
  const nav = useNavigate();

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc("my_memberships");
      if (error) {
        console.error(error);
        setLoading(false);
        return;
      }
      setMemberships(data ?? []);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="p-6">Loading…</div>;

  if (memberships.length === 0) {
    return (
      <div className="mx-auto max-w-2xl rounded bg-white p-6 shadow">
        <h2 className="text-xl font-semibold">Welcome to EasyShift</h2>
        <p className="mt-2 text-sm text-gray-600">
          You are not a member of any organization yet.
        </p>
        <div className="mt-4 flex gap-2">
          <Link
            className="rounded bg-gray-900 px-3 py-2 text-sm text-white hover:bg-black"
            to="/admin/create-org"
          >
            Create a new organization (Admin)
          </Link>
          <p className="text-sm text-gray-600">
            If you have an invite link, open it to join.
          </p>
        </div>
      </div>
    );
  }

  // Organization chooser with server-validated org selection
  return (
    <div className="mx-auto max-w-2xl rounded bg-white p-6 shadow">
      <h2 className="text-xl font-semibold">Choose organization</h2>
      <p className="mt-2 text-sm text-gray-600">
        Select which clinic you want to open.
      </p>
      <div className="mt-4 space-y-2">
        {memberships.map((m) => (
          <button
            key={m.org_id}
            className="w-full rounded border p-3 text-left hover:bg-gray-50"
            onClick={async () => {
              // Use OrgContext's server-validated setActiveOrgId
              const success = await setActiveOrgId(m.org_id);
              if (success) {
                nav(m.role === "ADMIN" ? "/admin" : "/schedule/current");
              } else {
                alert("Access denied to this organization");
              }
            }}
          >
            <div className="text-sm font-medium">{m.org_name}</div>
            <div className="text-xs text-gray-600">
              {m.role}
              {m.staff_role ? ` • ${m.staff_role}` : ""}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
