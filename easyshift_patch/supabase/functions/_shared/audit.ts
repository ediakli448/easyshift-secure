import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export async function logAudit(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
  action: string,
  entity: string,
  entityId: string | null,
  diff: Record<string, unknown> = {}
): Promise<void> {
  try {
    await supabase.rpc("log_audit", {
      p_org_id: orgId,
      p_user_id: userId,
      p_action: action,
      p_entity: entity,
      p_entity_id: entityId,
      p_diff: diff,
    });
  } catch (error) {
    // Don't fail the main operation if audit logging fails
    console.error("Audit logging failed:", error);
  }
}
