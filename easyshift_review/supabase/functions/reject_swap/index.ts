import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { z } from "https://esm.sh/zod@3.23.8";

const Body = z.object({ swapRequestId: z.string().uuid() });

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

    const { swapRequestId } = Body.parse(await req.json());

    const { data: r, error: e1 } = await supabase.from("swap_requests").select("org_id").eq("id", swapRequestId).single();
    if (e1) throw e1;

    const { data: m, error: e2 } = await supabase.from("org_members").select("role").eq("org_id", r.org_id).eq("user_id", auth.user.id).maybeSingle();
    if (e2) throw e2;
    if (m?.role !== "ADMIN") return json(403, { error: "forbidden" });

    const { error: e3 } = await supabase.from("swap_requests").update({ status: "REJECTED", resolved_at: new Date().toISOString() }).eq("id", swapRequestId);
    if (e3) throw e3;

    return json(200, { ok: true });
  } catch (e: any) {
    return json(400, { error: e?.message ?? "bad_request" });
  }
});
