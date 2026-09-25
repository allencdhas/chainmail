import { describe, expect, it } from "vitest";
import {
  adminRoleFor,
  combineRoles,
  hasAllRoles,
  hasAnyRole,
  hasRole,
  roleAtIndex,
  withoutRole,
  withRole,
} from "../../src/ens/eacRoles.js";

describe("roleAtIndex", () => {
  it("index 0 is bit 0 (1n)", () => {
    expect(roleAtIndex(0)).toBe(1n);
  });

  it("each index advances by 4 bits", () => {
    expect(roleAtIndex(1)).toBe(16n); // 1 << 4
    expect(roleAtIndex(2)).toBe(256n); // 1 << 8
    expect(roleAtIndex(4)).toBe(65_536n); // 1 << 16
  });

  it("matches every documented ENSv2 registry role constant", () => {
    expect(roleAtIndex(0)).toBe(1n << 0n); // ROLE_REGISTRAR
    expect(roleAtIndex(1)).toBe(1n << 4n); // ROLE_REGISTER_RESERVED
    expect(roleAtIndex(2)).toBe(1n << 8n); // ROLE_SET_PARENT
    expect(roleAtIndex(3)).toBe(1n << 12n); // ROLE_UNREGISTER
    expect(roleAtIndex(4)).toBe(1n << 16n); // ROLE_RENEW
    expect(roleAtIndex(5)).toBe(1n << 20n); // ROLE_SET_SUBREGISTRY
    expect(roleAtIndex(6)).toBe(1n << 24n); // ROLE_SET_RESOLVER
    expect(roleAtIndex(9)).toBe(1n << 36n); // ROLE_SET_URI
    expect(roleAtIndex(31)).toBe(1n << 124n); // ROLE_UPGRADE
  });

  it("throws for negative indices", () => {
    expect(() => roleAtIndex(-1)).toThrow(/Role index must be an integer in \[0, 31\]/);
  });

  it("throws for indices above 31", () => {
    expect(() => roleAtIndex(32)).toThrow(/Role index must be an integer in \[0, 31\]/);
  });

  it("throws for non-integer indices", () => {
    expect(() => roleAtIndex(1.5)).toThrow(/Role index must be an integer/);
  });
});

describe("adminRoleFor", () => {
  it("shifts the base role left by 128 bits", () => {
    expect(adminRoleFor(1n)).toBe(1n << 128n);
  });

  it("matches the documented ROLE_CAN_TRANSFER_ADMIN = (1 << 28) << 128", () => {
    expect(adminRoleFor(roleAtIndex(7))).toBe((1n << 28n) << 128n);
  });
});

describe("hasRole / hasAllRoles / hasAnyRole", () => {
  const roleA = roleAtIndex(0);
  const roleB = roleAtIndex(1);
  const roleC = roleAtIndex(2);
  const bitmap = combineRoles(roleA, roleB);

  it("hasRole is true only when every bit of the role is set", () => {
    expect(hasRole(bitmap, roleA)).toBe(true);
    expect(hasRole(bitmap, roleC)).toBe(false);
  });

  it("hasAllRoles requires every queried role to be present", () => {
    expect(hasAllRoles(bitmap, combineRoles(roleA, roleB))).toBe(true);
    expect(hasAllRoles(bitmap, combineRoles(roleA, roleC))).toBe(false);
  });

  it("hasAnyRole is true if at least one queried role is present", () => {
    expect(hasAnyRole(bitmap, combineRoles(roleC, roleB))).toBe(true);
    expect(hasAnyRole(bitmap, roleC)).toBe(false);
  });
});

describe("withRole / withoutRole", () => {
  it("withRole sets the bit without disturbing others", () => {
    const base = roleAtIndex(0);
    const updated = withRole(base, roleAtIndex(1));
    expect(hasRole(updated, roleAtIndex(0))).toBe(true);
    expect(hasRole(updated, roleAtIndex(1))).toBe(true);
  });

  it("withoutRole clears the bit without disturbing others", () => {
    const bitmap = combineRoles(roleAtIndex(0), roleAtIndex(1));
    const updated = withoutRole(bitmap, roleAtIndex(0));
    expect(hasRole(updated, roleAtIndex(0))).toBe(false);
    expect(hasRole(updated, roleAtIndex(1))).toBe(true);
  });

  it("withoutRole on a role that isn't set is a no-op", () => {
    const bitmap = roleAtIndex(0);
    expect(withoutRole(bitmap, roleAtIndex(5))).toBe(bitmap);
  });
});

describe("combineRoles", () => {
  it("ORs an arbitrary number of roles together", () => {
    const combined = combineRoles(roleAtIndex(0), roleAtIndex(1), roleAtIndex(2));
    expect(combined).toBe(roleAtIndex(0) | roleAtIndex(1) | roleAtIndex(2));
  });

  it("returns 0n for an empty list", () => {
    expect(combineRoles()).toBe(0n);
  });
});
