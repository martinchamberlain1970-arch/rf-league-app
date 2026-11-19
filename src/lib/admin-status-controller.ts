import { canManageLeagueRole, isAdministratorRole, isSuperRole, normalizeAppRole, type AppRole } from './app-roles';

export type AdminState = { loading: boolean; isAdmin: boolean; userId: string | null; email: string | null; isSuper: boolean; canManageLeague: boolean; role: AppRole };
type Identity = { id: string; email?: string };
export const emptyAdminState: AdminState = { loading: false, isAdmin: false, userId: null, email: null, isSuper: false, canManageLeague: false, role: 'user' };

// Identity controls the menu; the database role controls privileged links.
// A slow role request must never hide navigation or restore a signed-out user.
export function createAdminStatusController(readRole: (id: string) => Promise<string | null>, ownerEmail: string, publish: (state: AdminState) => void) {
  let state = { ...emptyAdminState, loading: true };
  let generation = 0;
  let disposed = false;
  let roleReady = false;
  let rolePending = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const emit = (next: AdminState) => { state = next; if (!disposed) publish(next); };
  return {
    accept(user: Identity | null, force = false) {
      if (disposed) return;
      if (user?.id === state.userId && (rolePending || (roleReady && !force))) return;
      const ticket = ++generation;
      clearTimeout(timer);
      rolePending = false;
      roleReady = false;
      if (!user) { emit({ ...emptyAdminState }); return; }
      // Never carry permissions across a change of account.
      emit({ ...(user.id === state.userId ? state : emptyAdminState), userId: user.id, email: user.email ?? null, loading: true });
      rolePending = true;
      // Supabase auth callbacks must return before calling its database APIs.
      timer = setTimeout(() => {
        void readRole(user.id).then((storedRole) => {
          if (disposed || ticket !== generation) return;
          const role = ownerEmail && user.email?.toLowerCase() === ownerEmail ? 'owner' : normalizeAppRole(storedRole);
          roleReady = true;
          rolePending = false;
          emit({ loading: false, userId: user.id, email: user.email ?? null, role, isAdmin: isAdministratorRole(role), isSuper: isSuperRole(role), canManageLeague: canManageLeagueRole(role) });
        }).catch(() => {
          if (disposed || ticket !== generation) return;
          rolePending = false;
          emit({ ...emptyAdminState, userId: user.id, email: user.email ?? null });
        });
      }, 0);
    },
    dispose() { disposed = true; generation++; clearTimeout(timer); },
  };
}
