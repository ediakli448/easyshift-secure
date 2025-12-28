import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { z } from "https://esm.sh/zod@3.23.8";
import { checkRateLimit, rateLimitResponse } from "../_shared/ratelimit.ts";
import { logAudit } from "../_shared/audit.ts";

const Item = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(["ALL_DAY", "MORNING_ONLY", "EVENING_ONLY", "NONE"]),
  preferred: z.enum(["MORNING", "EVENING", "NONE"]),
  note: z.string().max(500).optional().nullable(),
});

const Body = z.object({
  scheduleId: z.string().uuid(),
  items: z.array(Item).max(400), // protect from abuse
});

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function getClient(req: Request) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";
  return createClient(supabaseUrl, supabaseAnon, {
    global: { headers: { Authorization: authHeader } },
  });
}

Deno.serve(async (req) => {
  try {
    const supabase = getClient(req);
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth.user) return json(401, { error: "unauthorized" });

    // Rate limiting
    const rateCheck = await checkRateLimit(
      supabase,
      auth.user.id,
      "upsert_constraints"
    );
    if (!rateCheck.allowed) {
      return rateLimitResponse(rateCheck.retryAfter!);
    }

    const body = Body.parse(await req.json());

    // Ensure schedule belongs to an org the user is a member of
    const { data: sched, error: eSched } = await supabase
      .from("schedules")
      .select("org_id, status, submission_deadline")
      .eq("id", body.scheduleId)
      .single();
    if (eSched) throw eSched;

    // Deadline / lock enforcement server-side
    if (sched.status === "LOCKED" || sched.status === "PUBLISHED")
      return json(400, { error: "submissions_locked" });
    if (
      sched.submission_deadline &&
      new Date(sched.submission_deadline).getTime() < Date.now()
    )
      return json(400, { error: "deadline_passed" });

    // P1.6 FIX: Explicitly set user_id from auth.user.id instead of relying on trigger
    // This ensures consistent behavior and allows the trigger to be removed if needed
    const payload = body.items.map((it) => ({
      org_id: sched.org_id,
      schedule_id: body.scheduleId,
      user_id: auth.user!.id, // Explicitly set from authenticated user
      date: it.date,
      type: it.type,
      preferred: it.preferred,
      note: it.note ?? null,
    }));

    const { error } = await supabase
      .from("constraints")
      .upsert(payload, { onConflict: "schedule_id,user_id,date" });
    if (error) throw error;

    // Audit logging
    await logAudit(
      supabase,
      sched.org_id,
      auth.user.id,
      "CONSTRAINTS_SUBMITTED",
      "schedule",
      body.scheduleId,
      { itemCount: body.items.length }
    );

    return json(200, { ok: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "bad_request";
    return json(400, { error: message });
  }
});
