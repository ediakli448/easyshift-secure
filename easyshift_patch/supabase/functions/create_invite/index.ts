import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { z } from "https://esm.sh/zod@3.23.8";
import { checkRateLimit, rateLimitResponse } from "../_shared/ratelimit.ts";
import { logAudit } from "../_shared/audit.ts";

const Body = z.object({ orgId: z.string().uuid() });

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

// P1.5: Increased token entropy (32 bytes = 256 bits)
function token(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const b64 = btoa(String.fromCharCode(...bytes))
    .replaceAll("=", "")
    .replaceAll("+", "-")
    .replaceAll("/", "_");
  // Add prefix for easy identification and revocation
  return `inv_${b64}`;
}

Deno.serve(async (req) => {
  try {
    const supabase = getClient(req);
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth.user) return json(401, { error: "unauthorized" });

    // Rate limiting
    const rateCheck = await checkRateLimit(supabase, auth.user.id, "create_invite");
    if (!rateCheck.allowed) {
      return rateLimitResponse(rateCheck.retryAfter!);
    }

    const { orgId } = Body.parse(await req.json());

    // Verify admin membership
    const { data: m, error: mErr } = await supabase
      .from("org_members")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (mErr) throw mErr;
    if (m?.role !== "ADMIN") return json(403, { error: "forbidden" });

    const t = token();
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: invite, error } = await supabase
      .from("org_invites")
      .insert({
        org_id: orgId,
        token: t,
        expires_at: expires,
      })
      .select("id")
      .single();
    if (error) throw error;

    // Audit logging
    await logAudit(
      supabase,
      orgId,
      auth.user.id,
      "INVITE_CREATED",
      "org_invite",
      invite.id,
      { expires_at: expires }
    );

    return json(200, { token: t, expires_at: expires });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "bad_request";
    return json(400, { error: message });
  }
});
