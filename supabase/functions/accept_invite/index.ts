import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { z } from "https://esm.sh/zod@3.23.8";

const Body = z.object({ token: z.string().min(10) });

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

    const { token } = Body.parse(await req.json());

    const { data: inv, error: e1 } = await supabase
      .from("org_invites")
      .select("*")
      .eq("token", token)
      .maybeSingle();
    if (e1) throw e1;
    if (!inv) return json(404, { error: "invite_not_found" });
    if (inv.revoked_at) return json(400, { error: "invite_revoked" });
    if (inv.used_at) return json(400, { error: "invite_used" });
    if (new Date(inv.expires_at).getTime() < Date.now()) return json(400, { error: "invite_expired" });

    // Add membership as WORKER (no staff_role yet)
    const { error: e2 } = await supabase.from("org_members").insert({
      org_id: inv.org_id,
      user_id: auth.user.id,
      role: "WORKER",
      staff_role: null,
      invited_by_user_id: null,
    });
    if (e2) {
      // if already member, ok
      if (!String(e2.message).includes("duplicate") && !String(e2.message).includes("unique")) throw e2;
    }

    const { error: e3 } = await supabase.from("org_invites").update({
      used_at: new Date().toISOString(),
      used_by: auth.user.id,
    }).eq("id", inv.id);
    if (e3) throw e3;

    return json(200, { org_id: inv.org_id });
  } catch (e: any) {
    return json(400, { error: e?.message ?? "bad_request" });
  }
});
