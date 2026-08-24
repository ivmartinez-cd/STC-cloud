export interface EffectiveIdentity {
  id: string;
  username: string;
}

// El JWT del admin hardcodeado usa userId="admin" en vez de un uuid real de
// `users` — este puerto resuelve la identidad real para poder atribuir
// feedback/auditoría a un usuario existente. Mismo comportamiento que tenía
// el controller original, ahora nombrado y como dependencia explícita.
export interface IdentityResolver {
  resolveEffectiveIdentity(user: { userId: string; username?: string }): Promise<EffectiveIdentity>;
}
