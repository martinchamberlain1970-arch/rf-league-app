export const APP_ROLES = ["user", "admin", "league_secretary", "league_chairman", "super", "owner"] as const;

export type AppRole = (typeof APP_ROLES)[number];

export function normalizeAppRole(value?: string | null): AppRole {
  const role = String(value ?? "user").trim().toLowerCase().replaceAll("-", "_");
  return APP_ROLES.includes(role as AppRole) ? role as AppRole : "user";
}

export function isSuperRole(value?: string | null) {
  const role = normalizeAppRole(value);
  return role === "owner" || role === "super";
}

export function canManageLeagueRole(value?: string | null) {
  const role = normalizeAppRole(value);
  return isSuperRole(role) || role === "league_secretary" || role === "league_chairman";
}

export function isAdministratorRole(value?: string | null) {
  return normalizeAppRole(value) === "admin" || canManageLeagueRole(value);
}

export function appRoleLabel(value?: string | null) {
  const role = normalizeAppRole(value);
  if (role === "league_secretary") return "League Secretary";
  if (role === "league_chairman") return "League Chairman";
  if (role === "super" || role === "owner") return "Super User";
  if (role === "admin") return "Administrator";
  return "User";
}
