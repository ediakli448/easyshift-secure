import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { z } from "https://esm.sh/zod@3.23.8";

const Body = z.object({ assignmentId: z.string().uuid() });

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

    const { assignmentId } = Body.parse(await req.json());

    const { data: a, error: e1 } = await supabase.from("assignments").select("org_id,schedule_id,shift_id,user_id").eq("id", assignmentId).single();
    if (e1) throw e1;
    if (a.user_id !== auth.user.id) return json(403, { error: "not_yours" });

    // Create request
    const { data: r, error: e2 } = await supabase.from("swap_requests").insert({
      org_id: a.org_id,
      schedule_id: a.schedule_id,
      shift_id: a.shift_id,
      requester_user_id: auth.user.id,
      status: "REQUESTED"
    }).select("*").single();
    if (e2) throw e2;

    return json(200, { id: r.id });
  } catch (e: any) {
    return json(400, { error: e?.message ?? "bad_request" });
  }
});
