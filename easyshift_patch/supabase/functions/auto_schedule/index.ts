import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { z } from "https://esm.sh/zod@3.23.8";
import { checkRateLimit, rateLimitResponse } from "../_shared/ratelimit.ts";
import { logAudit } from "../_shared/audit.ts";

const Body = z.object({
  scheduleId: z.string().uuid(),
  // Sanitize notes to prevent XSS
  notesByUser: z
    .record(z.string(), z.string().max(500))
    .default({}),
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

function isBlocked(constraint: unknown, label: "MORNING" | "EVENING") {
  if (!constraint || typeof constraint !== "object") return false;
  const c = constraint as { type?: string };
  if (c.type === "ALL_DAY") return true;
  if (c.type === "MORNING_ONLY" && label === "MORNING") return true;
  if (c.type === "EVENING_ONLY" && label === "EVENING") return true;
  return false;
}

function prefBonus(constraint: unknown, label: "MORNING" | "EVENING") {
  if (!constraint || typeof constraint !== "object") return 0;
  const c = constraint as { preferred?: string };
  if (c.preferred === label) return -1;
  return 0;
}

Deno.serve(async (req) => {
  try {
    const supabase = getClient(req);
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth.user) return json(401, { error: "unauthorized" });

    // Rate limiting - expensive operation
    const rateCheck = await checkRateLimit(supabase, auth.user.id, "auto_schedule");
    if (!rateCheck.allowed) {
      return rateLimitResponse(rateCheck.retryAfter!);
    }

    const { scheduleId, notesByUser } = Body.parse(await req.json());

    // Load schedule/org
    const { data: sched, error: eS } = await supabase
      .from("schedules")
      .select("org_id,status")
      .eq("id", scheduleId)
      .single();
    if (eS) throw eS;

    // Admin check
    const { data: m, error: eM } = await supabase
      .from("org_members")
      .select("role")
      .eq("org_id", sched.org_id)
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (eM) throw eM;
    if (m?.role !== "ADMIN") return json(403, { error: "forbidden" });

    if (sched.status === "PUBLISHED")
      return json(400, { error: "already_published" });

    // Idempotency check - prevent duplicate auto-assignments
    const { data: existingAuto, error: eAuto } = await supabase
      .from("assignments")
      .select("id")
      .eq("schedule_id", scheduleId)
      .eq("assigned_by", "AUTO")
      .limit(1);
    if (eAuto) throw eAuto;

    if (existingAuto && existingAuto.length > 0) {
      return json(400, {
        error: "auto_schedule_already_ran",
        hint: "Delete existing auto-assignments first or use manual assignment",
      });
    }

    const { data: shifts, error: eSh } = await supabase
      .from("shifts")
      .select("*")
      .eq("schedule_id", scheduleId)
      .order("date")
      .order("label");
    if (eSh) throw eSh;

    const { data: members, error: eMem } = await supabase
      .from("org_members")
      .select("user_id,staff_role")
      .eq("org_id", sched.org_id)
      .eq("role", "WORKER");
    if (eMem) throw eMem;

    const { data: constraints, error: eC } = await supabase
      .from("constraints")
      .select("*")
      .eq("schedule_id", scheduleId);
    if (eC) throw eC;

    const { data: existing, error: eA } = await supabase
      .from("assignments")
      .select("*")
      .eq("schedule_id", scheduleId);
    if (eA) throw eA;

    // Build constraint lookup by (user_id,date)
    const cMap = new Map<string, unknown>();
    for (const c of constraints ?? []) cMap.set(`${c.user_id}|${c.date}`, c);

    // Current load per role
    const load = new Map<string, number>();
    const loadRole = new Map<string, number>();
    for (const a of existing ?? []) {
      const k = `${a.role}|${a.user_id}`;
      load.set(k, (load.get(k) ?? 0) + 1);
      loadRole.set(a.role, (loadRole.get(a.role) ?? 0) + 1);
    }

    const workersByRole = {
      VET: (members ?? [])
        .filter((x) => x.staff_role === "VET")
        .map((x) => x.user_id),
      ASSISTANT: (members ?? [])
        .filter((x) => x.staff_role === "ASSISTANT")
        .map((x) => x.user_id),
    } as Record<"VET" | "ASSISTANT", string[]>;

    // Helper: candidate ranking (lower score better)
    const score = (
      role: "VET" | "ASSISTANT",
      userId: string,
      shift: { date: string; label: string }
    ) => {
      const k = `${role}|${userId}`;
      const cnt = load.get(k) ?? 0;
      const c = cMap.get(`${userId}|${shift.date}`);
      const blocked = isBlocked(c, shift.label as "MORNING" | "EVENING");
      if (blocked) return 1e9;
      let s = cnt * 10;
      s += prefBonus(c, shift.label as "MORNING" | "EVENING");
      const note = notesByUser[userId];
      if (note) {
        if (note.toLowerCase().includes("morning") && shift.label === "EVENING")
          s += 50;
        if (note.toLowerCase().includes("evening") && shift.label === "MORNING")
          s += 50;
      }
      return s;
    };

    // Determine unfilled slots by checking existing assignments
    const inserts: Array<{
      org_id: string;
      schedule_id: string;
      shift_id: string;
      role: string;
      user_id: string;
      assigned_by: string;
      reason: string;
    }> = [];

    for (const sh of shifts ?? []) {
      const req = (sh.requirements as { VET?: number; ASSISTANT?: number }) ?? {
        VET: 1,
        ASSISTANT: 2,
      };

      for (const role of ["VET", "ASSISTANT"] as const) {
        const needed = req[role] ?? 0;
        const already = (existing ?? []).filter(
          (a) => a.shift_id === sh.id && a.role === role
        ).length;
        const missing = Math.max(0, needed - already);

        for (let i = 0; i < missing; i++) {
          const candidates = workersByRole[role]
            .map((u) => ({ u, s: score(role, u, sh) }))
            .filter((x) => x.s < 1e8)
            .sort((a, b) => a.s - b.s);

          if (candidates.length === 0) continue;

          const chosen = candidates[0].u;

          inserts.push({
            org_id: sh.org_id,
            schedule_id: scheduleId,
            shift_id: sh.id,
            role,
            user_id: chosen,
            assigned_by: "AUTO",
            reason: "Auto-assign (fairness-first heuristic)",
          });

          const k = `${role}|${chosen}`;
          load.set(k, (load.get(k) ?? 0) + 1);
          loadRole.set(role, (loadRole.get(role) ?? 0) + 1);
        }
      }
    }

    if (inserts.length) {
      const { error: eIns } = await supabase.from("assignments").insert(inserts);
      if (eIns) throw eIns;
    }

    // Audit logging
    await logAudit(
      supabase,
      sched.org_id,
      auth.user.id,
      "AUTO_SCHEDULE_RAN",
      "schedule",
      scheduleId,
      { assignmentsCreated: inserts.length }
    );

    return json(200, { ok: true, inserted: inserts.length });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "bad_request";
    return json(400, { error: message });
  }
});
