import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

export function OrgSettingsPage() {
  const orgId = localStorage.getItem("easyshift.activeOrgId");
  const [settings, setSettings] = useState<any>(null);
  const [invite, setInvite] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  const refresh = async () => {
    if (!orgId) return;
    const { data: s, error: e1 } = await supabase.from("org_settings").select("*").eq("org_id", orgId).maybeSingle();
    if (e1) setErr(e1.message);
    setSettings(s);

    const { data: i, error: e2 } = await supabase
      .from("org_invites")
      .select("*")
      .eq("org_id", orgId)
      .is("revoked_at", null)
      .is("used_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (e2) setErr(e2.message);
    setInvite(i);
  };

  useEffect(() => { void refresh(); }, [orgId]);

  const createInvite = async () => {
    setErr(null);
    const { data, error } = await supabase.functions.invoke("create_invite", { body: { orgId } });
    if (error) setErr(error.message);
    if (data?.error) setErr(data.error);
    await refresh();
  };

  const revokeInvite = async () => {
    setErr(null);
    if (!invite?.id) return;
    const { data, error } = await supabase.functions.invoke("revoke_invite", { body: { inviteId: invite.id } });
    if (error) setErr(error.message);
    if (data?.error) setErr(data.error);
    await refresh();
  };

  return (
    <div className="rounded bg-white p-6 shadow">
      <h1 className="text-xl font-semibold">Organization Settings</h1>
      {err && <div className="mt-3 rounded bg-red-50 p-2 text-sm text-red-700">{err}</div>}

      <div className="mt-4">
        <div className="text-sm font-medium">Invite link</div>
        {invite ? (
          <div className="mt-2 rounded border p-3">
            <div className="text-xs text-gray-600">Share this link with workers:</div>
            <div className="mt-1 break-all rounded bg-gray-50 p-2 font-mono text-xs">
              {window.location.origin}/join/{invite.token}
            </div>
            <button className="mt-3 rounded border px-3 py-2 text-sm hover:bg-gray-50" onClick={() => void revokeInvite()}>
              Revoke
            </button>
          </div>
        ) : (
          <div className="mt-2 rounded border p-3 text-sm text-gray-700">
            No active invite. Create one.
          </div>
        )}

        <button className="mt-3 rounded bg-gray-900 px-3 py-2 text-sm text-white hover:bg-black" onClick={() => void createInvite()}>
          Create new invite link
        </button>
      </div>

      <div className="mt-6">
        <div className="text-sm font-medium">Settings (read-only in this demo UI)</div>
        <pre className="mt-2 overflow-auto rounded bg-gray-50 p-3 text-xs">{JSON.stringify(settings, null, 2)}</pre>
        <p className="mt-2 text-xs text-gray-500">
          In Lovable, you can extend this page to edit settings and generate schedules from the UI.
        </p>
      </div>
    </div>
  );
}
