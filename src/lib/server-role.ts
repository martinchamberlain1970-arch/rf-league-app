import type { SupabaseClient, User } from "@supabase/supabase-js";
import { canManageLeagueRole, isSuperRole, normalizeAppRole, type AppRole } from "@/lib/app-roles";

export async function resolveServerRole(adminClient: SupabaseClient, user: User): Promise<AppRole> {
  const configuredOwnerEmail = (
    process.env.SUPER_ADMIN_EMAIL ??
    process.env.NEXT_PUBLIC_SUPER_ADMIN_EMAIL ??
    process.env.NEXT_PUBLIC_OWNER_EMAIL ??
    ""
  ).trim().toLowerCase();
  if (configuredOwnerEmail && user.email?.trim().toLowerCase() === configuredOwnerEmail) return "owner";

  const appUser = await adminClient.from("app_users").select("role").eq("id", user.id).maybeSingle();
  if (appUser.error) throw new Error(appUser.error.message);
  return normalizeAppRole((appUser.data as { role?: string | null } | null)?.role ?? user.user_metadata?.role);
}

export async function requireLeagueManager(adminClient: SupabaseClient, user: User) {
  const role = await resolveServerRole(adminClient, user);
  if (!canManageLeagueRole(role)) throw new Error("FORBIDDEN_LEAGUE_MANAGER");
  return role;
}

export async function requireSuperUser(adminClient: SupabaseClient, user: User) {
  const role = await resolveServerRole(adminClient, user);
  if (!isSuperRole(role)) throw new Error("FORBIDDEN_SUPER_USER");
  return role;
}
