import type { Role } from './types.ts';

const ROLE_ORDER: readonly Role[] = ['broadcaster', 'mod', 'vip', 'sub'];

export function sortRoles(roles: Iterable<Role>): readonly Role[] {
  const present = new Set(roles);
  return ROLE_ORDER.filter((role) => present.has(role));
}
