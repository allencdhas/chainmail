import { adminRoleFor, roleAtIndex } from "./eacRoles.js";

/**
 * ENSv2 registry-side roles (root- or per-name-scoped), sourced from
 * docs.ens.domains/ensv2/permissioned-registry (fetched 2026-09-25):
 *
 *   ROLE_REGISTRAR          1 << 0
 *   ROLE_REGISTER_RESERVED  1 << 4
 *   ROLE_SET_PARENT         1 << 8
 *   ROLE_UNREGISTER         1 << 12
 *   ROLE_RENEW              1 << 16
 *   ROLE_SET_SUBREGISTRY    1 << 20
 *   ROLE_SET_RESOLVER       1 << 24
 *   ROLE_CAN_TRANSFER_ADMIN (1 << 28) << 128   -- implies a base "can transfer" role at 1 << 28
 *   ROLE_SET_URI            1 << 36
 *   ROLE_UPGRADE            1 << 124
 *
 * Every value below is expressed via `roleAtIndex(i)` (`1n << (4n * i)`),
 * which reproduces each documented constant exactly — this was checked by
 * hand against the list above before being encoded this way. Nybble indices
 * 7 and 8 are not both directly named in the docs (only the _ADMIN variant
 * of index 7 is): included here for the `_ADMIN` derivation, not because
 * the base role is independently confirmed to be callable app-side.
 */
export const REGISTRY_ROLES = {
  REGISTRAR: roleAtIndex(0),
  REGISTER_RESERVED: roleAtIndex(1),
  SET_PARENT: roleAtIndex(2),
  UNREGISTER: roleAtIndex(3),
  RENEW: roleAtIndex(4),
  SET_SUBREGISTRY: roleAtIndex(5),
  SET_RESOLVER: roleAtIndex(6),
  CAN_TRANSFER: roleAtIndex(7),
  SET_URI: roleAtIndex(9),
  UPGRADE: roleAtIndex(31),
} as const;

export const REGISTRY_ADMIN_ROLES = {
  REGISTRAR_ADMIN: adminRoleFor(REGISTRY_ROLES.REGISTRAR),
  REGISTER_RESERVED_ADMIN: adminRoleFor(REGISTRY_ROLES.REGISTER_RESERVED),
  RENEW_ADMIN: adminRoleFor(REGISTRY_ROLES.RENEW),
  /** Directly confirmed in docs as `(1 << 28) << 128`. */
  CAN_TRANSFER_ADMIN: adminRoleFor(REGISTRY_ROLES.CAN_TRANSFER),
} as const;

/**
 * ENSv2 Permissioned Resolver roles. Only `SET_TEXT` is used by this app
 * (see `proposalRecord.ts`), and its value is directly confirmed by the
 * docs.ens.domains/ensv2/permissioned-resolver code example:
 *
 *   authorizeNameRoles(toName, 1n << 4n, account, true) // grants ROLE_SET_TEXT for all keys
 *
 * ROLE_SET_ADDR and ROLE_SET_DATA are intentionally NOT defined here — their
 * numeric values were not directly confirmed during research. Do not guess
 * them; source from the live PermissionedResolver ABI if a future module
 * needs them. Note also that resolver roles occupy a separate EAC resource
 * space from registry roles (different contract), so index reuse across the
 * two constant objects is expected and not a collision.
 */
export const RESOLVER_ROLES = {
  SET_TEXT: roleAtIndex(1),
} as const;
