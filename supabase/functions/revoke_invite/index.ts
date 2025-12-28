import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { z } from "https://esm.sh/zod@3.23.8";

const Body = z.object({ inviteId: z.string().uuid() });

function json(status: number, body: any) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" }});
}
function getClient(req: Request) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";
  return createClient(supabaseUrl, supabaseAnon, { global: { headers: { Authorization: authHeader } } });
}

Deno.serve(async (req) => {
  try {
    const supabase = getClient(req);
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth.user) return json(401, { error: "unauthorized" });

    const { inviteId } = Body.parse(await req.json());

    // Lookup org_id for invite
    const { data: inv, error: e1 } = await supabase.from("org_invites").select("org_id").eq("id", inviteId).single();
    if (e1) throw e1;

    // Verify admin membership
    const { data: m, error: mErr } = await supabase.from("org_members")
      .select("role")
      .eq("org_id", inv.org_id)
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (mErr) throw mErr;
    if (m?.role !== "ADMIN") return json(403, { error: "forbidden" });

    const { error } = await supabase.from("org_invites").update({ revoked_at: new Date().toISOString() }).eq("id", inviteId);
    if (error) throw error;

    return json(200, { ok: true });
  } catch (e: any) {
    return json(400, { error: e?.message ?? "bad_request" });
  }
});
