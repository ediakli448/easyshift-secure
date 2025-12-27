import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { z } from "https://esm.sh/zod@3.23.8";

const Body = z.object({
  scheduleId: z.string().uuid(),
  shiftId: z.string().uuid(),
  role: z.enum(["VET","ASSISTANT"]),
  userId: z.string().uuid(),
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

    const body = Body.parse(await req.json());

    // Verify schedule/shift belong to same org
    const { data: sh, error: e1 } = await supabase.from("shifts").select("org_id, schedule_id, date, label").eq("id", body.shiftId).single();
    if (e1) throw e1;
    if (sh.schedule_id !== body.scheduleId) return json(400, { error: "mismatch_schedule" });

    // Verify admin membership
    const { data: m, error: e2 } = await supabase.from("org_members")
      .select("role")
      .eq("org_id", sh.org_id)
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (e2) throw e2;
    if (m?.role !== "ADMIN") return json(403, { error: "forbidden" });

    // Verify target user is member of org and role matches staff_role
    const { data: target, error: e3 } = await supabase.from("org_members")
      .select("staff_role")
      .eq("org_id", sh.org_id)
      .eq("user_id", body.userId)
      .maybeSingle();
    if (e3) throw e3;
    if (!target) return json(400, { error: "user_not_in_org" });
    if (target.staff_role !== body.role) return json(400, { error: "staff_role_mismatch" });

    // Verify constraints do not block
    const { data: c } = await supabase.from("constraints").select("type").eq("schedule_id", body.scheduleId).eq("user_id", body.userId).eq("date", sh.date).maybeSingle();
    const blocked =
      c?.type === "ALL_DAY" ||
      (c?.type === "MORNING_ONLY" && sh.label === "MORNING") ||
      (c?.type === "EVENING_ONLY" && sh.label === "EVENING");
    if (blocked) return json(400, { error: "user_unavailable" });

    // Insert assignment
    const { error: e4 } = await supabase.from("assignments").insert({
      org_id: sh.org_id,
      schedule_id: body.scheduleId,
      shift_id: body.shiftId,
      role: body.role,
      user_id: body.userId,
      assigned_by: "ADMIN",
      reason: "Manual assignment",
    });
    if (e4) throw e4;

    return json(200, { ok: true });
  } catch (e: any) {
    return json(400, { error: e?.message ?? "bad_request" });
  }
});
