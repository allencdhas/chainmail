/**
 * Generic Enhanced Access Control (EAC) role-bitmap utilities.
 *
 * ENSv2's EAC packs up to 32 roles into a `uint256`: each base role is a
 * 4-bit "nybble" at bit offset `4*i` for `i` in `0..31` (the low 128 bits),
 * and every base role has a paired admin role at the mirrored position in
 * the high 128 bits (`baseRole << 128`). Holding a role's admin variant is
 * what lets an account grant/revoke that base role on others.
 *
 * This module intentionally implements ONLY the bitmap arithmetic — it does
 * not hardcode ENS's actual numeric role constants (which live in
 * `ensRoleConstants.ts`, each annotated with its documentation source).
 * Keeping the math generic makes it independently verifiable against the
 * publicly documented pattern without trusting any specific deployment.
 */

export const ADMIN_ROLE_SHIFT = 128n;
export const MAX_ROLE_INDEX = 31;

/** Returns the base-role bitmap value for nybble index `i` (0..31), i.e. `1n << (4n * i)`. */
export function roleAtIndex(index: number): bigint {
  if (!Number.isInteger(index) || index < 0 || index > MAX_ROLE_INDEX) {
    throw new Error(`Role index must be an integer in [0, ${MAX_ROLE_INDEX}], got ${index}.`);
  }
  return 1n << (BigInt(index) * 4n);
}

/** Returns the admin-role bitmap value that authorizes granting/revoking `baseRole`. */
export function adminRoleFor(baseRole: bigint): bigint {
  return baseRole << ADMIN_ROLE_SHIFT;
}

export function hasRole(bitmap: bigint, role: bigint): boolean {
  return (bitmap & role) === role;
}

export function hasAllRoles(bitmap: bigint, roles: bigint): boolean {
  return (bitmap & roles) === roles;
}

export function hasAnyRole(bitmap: bigint, roles: bigint): boolean {
  return (bitmap & roles) !== 0n;
}

export function withRole(bitmap: bigint, role: bigint): bigint {
  return bitmap | role;
}

export function withoutRole(bitmap: bigint, role: bigint): bigint {
  return bitmap & ~role;
}

export function combineRoles(...roles: readonly bigint[]): bigint {
  return roles.reduce((acc, role) => acc | role, 0n);
}
