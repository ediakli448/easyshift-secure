import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { z } from "https://esm.sh/zod@3.23.8";
import { checkRateLimit, rateLimitResponse } from "../_shared/ratelimit.ts";
import { logAudit } from "../_shared/audit.ts";

const Body = z.object({
  swapRequestId: z.string().uuid(),
  offerId: z.string().uuid(),
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
    const rateCheck = await checkRateLimit(supabase, auth.user.id, "approve_swap");
    if (!rateCheck.allowed) {
      return rateLimitResponse(rateCheck.retryAfter!);
    }

    const { swapRequestId, offerId } = Body.parse(await req.json());

    // Use atomic RPC to prevent race conditions
    const { data: result, error: txError } = await supabase.rpc(
      "approve_swap_atomic",
      {
        p_swap_request_id: swapRequestId,
        p_offer_id: offerId,
        p_admin_user_id: auth.user.id,
      }
    );

    if (txError) throw txError;

    if (result?.error) {
      // Map error codes to HTTP status
      const errorMap: Record<string, number> = {
        swap_not_found: 404,
        already_resolved: 400,
        forbidden: 403,
        offer_not_found: 404,
        requester_role_not_found: 400,
        assignment_not_found: 400,
      };
      const status = errorMap[result.error] ?? 400;
      return json(status, { error: result.error });
    }

    return json(200, { ok: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "bad_request";
    return json(400, { error: message });
  }
});
