import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

type RateLimitConfig = {
  window: number;  // seconds
  max: number;     // max requests in window
};

const RATE_LIMITS: Record<string, RateLimitConfig> = {
  "create_invite": { window: 60, max: 10 },
  "auto_schedule": { window: 60, max: 5 },
  "upsert_constraints": { window: 60, max: 30 },
  "request_swap": { window: 60, max: 20 },
  "offer_swap": { window: 60, max: 20 },
  "approve_swap": { window: 60, max: 50 },
};

export async function checkRateLimit(
  supabase: SupabaseClient,
  userId: string,
  functionName: string
): Promise<{ allowed: boolean; retryAfter?: number }> {
  const limit = RATE_LIMITS[functionName];
  if (!limit) return { allowed: true };

  const key = `ratelimit:${functionName}:${userId}`;
  const now = Math.floor(Date.now() / 1000);

  // Check current count
  const { data: currentCount } = await supabase.rpc("check_rate_limit", {
    p_key: key,
    p_window_seconds: limit.window,
  });

  if (currentCount !== null && currentCount >= limit.max) {
    return { allowed: false, retryAfter: limit.window };
  }

  // Increment counter
  await supabase.rpc("increment_rate_limit", {
    p_key: key,
    p_window_start: now,
    p_ttl: limit.window,
  });

  return { allowed: true };
}

export function rateLimitResponse(retryAfter: number): Response {
  return new Response(
    JSON.stringify({
      error: "rate_limit_exceeded",
      retry_after: retryAfter,
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfter),
      },
    }
  );
}
