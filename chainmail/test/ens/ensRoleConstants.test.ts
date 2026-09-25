import { describe, expect, it } from "vitest";
import { hasRole } from "../../src/ens/eacRoles.js";
import {
  REGISTRY_ADMIN_ROLES,
  REGISTRY_ROLES,
  RESOLVER_ROLES,
} from "../../src/ens/ensRoleConstants.js";

describe("REGISTRY_ROLES", () => {
  it("matches every documented numeric constant exactly", () => {
    expect(REGISTRY_ROLES.REGISTRAR).toBe(1n << 0n);
    expect(REGISTRY_ROLES.REGISTER_RESERVED).toBe(1n << 4n);
    expect(REGISTRY_ROLES.SET_PARENT).toBe(1n << 8n);
    expect(REGISTRY_ROLES.UNREGISTER).toBe(1n << 12n);
    expect(REGISTRY_ROLES.RENEW).toBe(1n << 16n);
    expect(REGISTRY_ROLES.SET_SUBREGISTRY).toBe(1n << 20n);
    expect(REGISTRY_ROLES.SET_RESOLVER).toBe(1n << 24n);
    expect(REGISTRY_ROLES.SET_URI).toBe(1n << 36n);
    expect(REGISTRY_ROLES.UPGRADE).toBe(1n << 124n);
  });

  it("has 10 distinct, non-overlapping role bits", () => {
    const values = Object.values(REGISTRY_ROLES);
    const unique = new Set(values.map(String));
    expect(unique.size).toBe(values.length);

    let union = 0n;
    for (const role of values) {
      expect(union & role).toBe(0n); // no overlap with previously-combined roles
      union |= role;
    }
  });
});

describe("REGISTRY_ADMIN_ROLES", () => {
  it("CAN_TRANSFER_ADMIN matches the docs' directly-stated (1 << 28) << 128", () => {
    expect(REGISTRY_ADMIN_ROLES.CAN_TRANSFER_ADMIN).toBe((1n << 28n) << 128n);
  });

  it("each admin role holds the corresponding base role at +128 bit offset", () => {
    expect(REGISTRY_ADMIN_ROLES.REGISTRAR_ADMIN).toBe(REGISTRY_ROLES.REGISTRAR << 128n);
    expect(REGISTRY_ADMIN_ROLES.RENEW_ADMIN).toBe(REGISTRY_ROLES.RENEW << 128n);
  });

  it("admin roles never accidentally collide with base roles when checked with hasRole", () => {
    expect(hasRole(REGISTRY_ADMIN_ROLES.RENEW_ADMIN, REGISTRY_ROLES.RENEW)).toBe(false);
  });
});

describe("RESOLVER_ROLES", () => {
  it("SET_TEXT matches the docs' directly-confirmed example (1n << 4n)", () => {
    expect(RESOLVER_ROLES.SET_TEXT).toBe(1n << 4n);
  });

  it("does not define SET_ADDR or SET_DATA (unverified — must not be guessed)", () => {
    expect("SET_ADDR" in RESOLVER_ROLES).toBe(false);
    expect("SET_DATA" in RESOLVER_ROLES).toBe(false);
  });
});
