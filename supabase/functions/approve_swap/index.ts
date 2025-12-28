import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { z } from "https://esm.sh/zod@3.23.8";

const Body = z.object({
  swapRequestId: z.string().uuid(),
  offerId: z.string().uuid()
});

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

    const { swapRequestId, offerId } = Body.parse(await req.json());

    const { data: r, error: e1 } = await supabase.from("swap_requests").select("*").eq("id", swapRequestId).single();
    if (e1) throw e1;

    // Admin check
    const { data: m, error: e2 } = await supabase.from("org_members").select("role").eq("org_id", r.org_id).eq("user_id", auth.user.id).maybeSingle();
    if (e2) throw e2;
    if (m?.role !== "ADMIN") return json(403, { error: "forbidden" });

    const { data: offer, error: e3 } = await supabase.from("swap_offers").select("*").eq("id", offerId).eq("swap_request_id", swapRequestId).single();
    if (e3) throw e3;

    // Find requester's assignment for that shift (same role)
    const { data: reqMember, error: e4 } = await supabase.from("org_members").select("staff_role").eq("org_id", r.org_id).eq("user_id", r.requester_user_id).maybeSingle();
    if (e4) throw e4;
    const role = reqMember?.staff_role;
    if (!role) return json(400, { error: "missing_staff_role" });

    const { data: asg, error: e5 } = await supabase.from("assignments")
      .select("*")
      .eq("shift_id", r.shift_id)
      .eq("user_id", r.requester_user_id)
      .eq("role", role)
      .maybeSingle();
    if (e5) throw e5;
    if (!asg) return json(400, { error: "requester_assignment_not_found" });

    // Swap: update assignment user_id to offer_user_id
    const { error: e6 } = await supabase.from("assignments").update({
      user_id: offer.offer_user_id,
      assigned_by: "ADMIN",
      reason: "Swap approved"
    }).eq("id", asg.id);
    if (e6) throw e6;

    // Update swap request
    const { error: e7 } = await supabase.from("swap_requests").update({
      status: "APPROVED",
      resolved_at: new Date().toISOString()
    }).eq("id", swapRequestId);
    if (e7) throw e7;

    // Notify both
    await supabase.from("notifications").insert([
      { org_id: r.org_id, user_id: r.requester_user_id, type: "SWAP_APPROVED", payload: { swapRequestId } },
      { org_id: r.org_id, user_id: offer.offer_user_id, type: "SWAP_APPROVED", payload: { swapRequestId } },
    ]);

    return json(200, { ok: true });
  } catch (e: any) {
    return json(400, { error: e?.message ?? "bad_request" });
  }
});
