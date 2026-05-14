import type { SupabaseClient } from "@supabase/supabase-js";

type ServerAuditOptions = {
  actorUserId: string;
  actorEmail: string | null;
  actorRole: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  summary?: string | null;
  meta?: Record<string, unknown> | null;
};

export async function logServerAudit(
  adminClient: SupabaseClient,
  options: ServerAuditOptions
): Promise<void> {
  try {
    await adminClient.from("audit_logs").insert({
      actor_user_id: options.actorUserId,
      actor_email: options.actorEmail,
      actor_role: options.actorRole,
      action: options.action,
      entity_type: options.entityType ?? null,
      entity_id: options.entityId ?? null,
      summary: options.summary ?? null,
      meta: options.meta ?? {},
    });
  } catch {
    // Never block the main workflow if audit logging fails.
  }
}
