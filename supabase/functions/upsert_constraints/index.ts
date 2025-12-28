import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { z } from "https://esm.sh/zod@3.23.8";

const Item = z.object({
  org_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(["ALL_DAY","MORNING_ONLY","EVENING_ONLY","NONE"]),
  preferred: z.enum(["MORNING","EVENING","NONE"]),
  note: z.string().max(500).optional().nullable(),
});
const Body = z.object({
  scheduleId: z.string().uuid(),
  items: z.array(Item).max(400) // protect from abuse
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

    // Ensure schedule belongs to an org the user is a member of
    const { data: sched, error: eSched } = await supabase.from("schedules").select("org_id, status, submission_deadline").eq("id", body.scheduleId).single();
    if (eSched) throw eSched;

    // Deadline / lock enforcement server-side
    if (sched.status === "LOCKED" || sched.status === "PUBLISHED") return json(400, { error: "submissions_locked" });
    if (sched.submission_deadline && new Date(sched.submission_deadline).getTime() < Date.now()) return json(400, { error: "deadline_passed" });

    // Upsert - user_id is enforced by trigger set_constraint_user_id()
    const payload = body.items.map((it) => ({
      org_id: sched.org_id,
      schedule_id: body.scheduleId,
      date: it.date,
      type: it.type,
      preferred: it.preferred,
      note: it.note ?? null,
    }));

    const { error } = await supabase.from("constraints").upsert(payload, { onConflict: "schedule_id,user_id,date" });
    if (error) throw error;

    return json(200, { ok: true });
  } catch (e: any) {
    return json(400, { error: e?.message ?? "bad_request" });
  }
});
