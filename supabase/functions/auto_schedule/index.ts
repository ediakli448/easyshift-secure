import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { z } from "https://esm.sh/zod@3.23.8";

const Body = z.object({
  scheduleId: z.string().uuid(),
  notesByUser: z.record(z.string(), z.string().max(500)).default({})
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

function isBlocked(constraint: any, label: "MORNING" | "EVENING") {
  if (!constraint) return false;
  if (constraint.type === "ALL_DAY") return true;
  if (constraint.type === "MORNING_ONLY" && label === "MORNING") return true;
  if (constraint.type === "EVENING_ONLY" && label === "EVENING") return true;
  return false;
}

function prefBonus(constraint: any, label: "MORNING" | "EVENING") {
  if (!constraint) return 0;
  if (constraint.preferred === label) return -1;
  return 0;
}

Deno.serve(async (req) => {
  try {
    const supabase = getClient(req);
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth.user) return json(401, { error: "unauthorized" });

    const { scheduleId, notesByUser } = Body.parse(await req.json());

    // Load schedule/org
    const { data: sched, error: eS } = await supabase.from("schedules").select("org_id,status").eq("id", scheduleId).single();
    if (eS) throw eS;

    // Admin check
    const { data: m, error: eM } = await supabase.from("org_members").select("role").eq("org_id", sched.org_id).eq("user_id", auth.user.id).maybeSingle();
    if (eM) throw eM;
    if (m?.role !== "ADMIN") return json(403, { error: "forbidden" });

    if (sched.status === "PUBLISHED") return json(400, { error: "already_published" });

    const { data: shifts, error: eSh } = await supabase.from("shifts").select("*").eq("schedule_id", scheduleId).order("date").order("label");
    if (eSh) throw eSh;

    const { data: members, error: eMem } = await supabase.from("org_members").select("user_id,staff_role").eq("org_id", sched.org_id).eq("role", "WORKER");
    if (eMem) throw eMem;

    const { data: constraints, error: eC } = await supabase.from("constraints").select("*").eq("schedule_id", scheduleId);
    if (eC) throw eC;

    const { data: existing, error: eA } = await supabase.from("assignments").select("*").eq("schedule_id", scheduleId);
    if (eA) throw eA;

    // Build constraint lookup by (user_id,date)
    const cMap = new Map<string, any>();
    for (const c of (constraints ?? [])) cMap.set(`${c.user_id}|${c.date}`, c);

    // Current load per role
    const load = new Map<string, number>();
    const loadRole = new Map<string, number>(); // per role totals
    for (const a of (existing ?? [])) {
      const k = `${a.role}|${a.user_id}`;
      load.set(k, (load.get(k) ?? 0) + 1);
      loadRole.set(a.role, (loadRole.get(a.role) ?? 0) + 1);
    }

    const workersByRole = {
      VET: (members ?? []).filter((x: any) => x.staff_role === "VET").map((x: any) => x.user_id),
      ASSISTANT: (members ?? []).filter((x: any) => x.staff_role === "ASSISTANT").map((x: any) => x.user_id),
    } as Record<"VET"|"ASSISTANT", string[]>;

    // Helper: candidate ranking (lower score better)
    const score = (role: "VET" | "ASSISTANT", userId: string, shift: any) => {
      const k = `${role}|${userId}`;
      const cnt = load.get(k) ?? 0;
      const c = cMap.get(`${userId}|${shift.date}`);
      const blocked = isBlocked(c, shift.label);
      if (blocked) return 1e9;
      let s = cnt * 10;
      s += prefBonus(c, shift.label);
      const note = notesByUser[userId];
      if (note) {
        if (note.toLowerCase().includes("morning") && shift.label === "EVENING") s += 50;
        if (note.toLowerCase().includes("evening") && shift.label === "MORNING") s += 50;
      }
      return s;
    };

    // Determine unfilled slots by checking existing assignments
    const inserts: any[] = [];
    for (const sh of (shifts ?? [])) {
      const req = sh.requirements ?? { VET: 1, ASSISTANT: 2 };

      for (const role of ["VET","ASSISTANT"] as const) {
        const needed = req[role] ?? 0;
        const already = (existing ?? []).filter((a: any) => a.shift_id === sh.id && a.role === role).length;
        const missing = Math.max(0, needed - already);

        for (let i = 0; i < missing; i++) {
          const candidates = workersByRole[role]
            .map((u) => ({ u, s: score(role, u, sh) }))
            .filter((x) => x.s < 1e8)
            .sort((a,b) => a.s - b.s);

          if (candidates.length === 0) continue;

          const chosen = candidates[0].u;

          inserts.push({
            org_id: sh.org_id,
            schedule_id: scheduleId,
            shift_id: sh.id,
            role,
            user_id: chosen,
            assigned_by: "AUTO",
            reason: "Auto-assign (fairness-first heuristic)"
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

    return json(200, { ok: true, inserted: inserts.length });
  } catch (e: any) {
    return json(400, { error: e?.message ?? "bad_request" });
  }
});
