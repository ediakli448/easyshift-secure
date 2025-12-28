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

    const { data: r, error: e1 } = await supabase.from("swap_requests").select("*").eq("id", swapRequestId).single();
    if (e1) throw e1;
    if (r.requester_user_id === auth.user.id) return json(400, { error: "cannot_offer_own" });

    // Ensure offerer is in same org
    const { data: mOffer, error: e2 } = await supabase.from("org_members").select("staff_role").eq("org_id", r.org_id).eq("user_id", auth.user.id).maybeSingle();
    if (e2) throw e2;
    if (!mOffer) return json(403, { error: "not_in_org" });

    // Ensure requester staff_role matches offerer staff_role (swap only within same role)
    const { data: mReq, error: e3 } = await supabase.from("org_members").select("staff_role").eq("org_id", r.org_id).eq("user_id", r.requester_user_id).maybeSingle();
    if (e3) throw e3;
    if (!mReq?.staff_role || !mOffer?.staff_role) return json(400, { error: "missing_staff_role" });
    if (mReq.staff_role !== mOffer.staff_role) return json(400, { error: "role_mismatch" });

    const { data: offer, error: e4 } = await supabase.from("swap_offers").insert({
      swap_request_id: swapRequestId,
      offer_user_id: auth.user.id
    }).select("*").single();
    if (e4) throw e4;

    // Move status to ADMIN_APPROVAL
    const { error: e5 } = await supabase.from("swap_requests").update({ status: "ADMIN_APPROVAL" }).eq("id", swapRequestId);
    if (e5) throw e5;

    return json(200, { id: offer.id });
  } catch (e: any) {
    return json(400, { error: e?.message ?? "bad_request" });
  }
});
