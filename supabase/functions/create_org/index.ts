import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { z } from "https://esm.sh/zod@3.23.8";

const Body = z.object({
  name: z.string().min(2),
  timezone: z.string().min(1),
  weekStart: z.string().min(1),
  shiftChangeTime: z.string().regex(/^\d{2}:\d{2}$/),
  openingHours: z.any(),
  defaultRequirements: z.any(),
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

    // Create org as the authenticated user
    const { data: org, error: e1 } = await supabase.from("orgs").insert({
      name: body.name,
      created_by_user_id: auth.user.id,
    }).select("*").single();
    if (e1) throw e1;

    // Add membership as ADMIN
    const { error: e2 } = await supabase.from("org_members").insert({
      org_id: org.id,
      user_id: auth.user.id,
      role: "ADMIN",
      staff_role: null,
      invited_by_user_id: auth.user.id,
    });
    if (e2) throw e2;

    // Settings
    const { error: e3 } = await supabase.from("org_settings").insert({
      org_id: org.id,
      timezone: body.timezone,
      week_start: body.weekStart,
      opening_hours: body.openingHours,
      shift_change_time: body.shiftChangeTime,
      default_requirements: body.defaultRequirements,
      submission_deadline: null,
    });
    if (e3) throw e3;

    return json(200, { org_id: org.id });
  } catch (e: any) {
    return json(400, { error: e?.message ?? "bad_request" });
  }
});
