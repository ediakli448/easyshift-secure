import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { z } from "https://esm.sh/zod@3.23.8";

const Body = z.object({ orgId: z.string().uuid() });

function json(status: number, body: any) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" }});
}

function getClient(req: Request) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";
  return createClient(supabaseUrl, supabaseAnon, { global: { headers: { Authorization: authHeader } } });
}

function token() {
  // simple random; ok for invite token length
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replaceAll("=", "").replaceAll("+","-").replaceAll("/","_");
}

Deno.serve(async (req) => {
  try {
    const supabase = getClient(req);
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth.user) return json(401, { error: "unauthorized" });

    const { orgId } = Body.parse(await req.json());

    // Verify admin membership
    const { data: m, error: mErr } = await supabase.from("org_members")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (mErr) throw mErr;
    if (m?.role !== "ADMIN") return json(403, { error: "forbidden" });

    const t = token();
    const expires = new Date(Date.now() + 7*24*60*60*1000).toISOString();

    const { error } = await supabase.from("org_invites").insert({
      org_id: orgId,
      token: t,
      expires_at: expires,
    });
    if (error) throw error;

    return json(200, { token: t, expires_at: expires });
  } catch (e: any) {
    return json(400, { error: e?.message ?? "bad_request" });
  }
});
