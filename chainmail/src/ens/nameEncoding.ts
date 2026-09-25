import { bytesToHex, hexToBytes } from "viem";

const MAX_LABEL_BYTES = 63;
const SIMPLE_LABEL_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

/**
 * DNS-wire ("packet") encodes a dotted ENS name, e.g. `"alice.chainmail.eth"`
 * into length-prefixed labels terminated by a zero byte. This is the
 * `toName` format required by ENSv2's `authorize*Roles` resolver functions.
 *
 * Verified against the well-known test vector `dnsEncodeName("eth")` ===
 * `"0x0365746800"` (see unit tests).
 *
 * LIMITATION: this does not perform ENSIP-15/UTS-46 name normalization (the
 * full ENS normalization algorithm — see `@adraffy/ens-normalize` or
 * ensjs's `normalize()`). Only simple lowercase ASCII alphanumeric-and-hyphen
 * labels are accepted; anything else throws rather than silently producing
 * an encoding that could resolve differently than intended. Run full
 * normalization upstream before calling this if international or emoji
 * labels are ever accepted from users.
 */
export function dnsEncodeName(name: string): `0x${string}` {
  const trimmed = name.trim();
  if (trimmed === "" || trimmed === ".") {
    return "0x00";
  }

  const encodedLabels = trimmed.split(".").map((label) => {
    assertSimpleAsciiLabel(label);
    const bytes = new TextEncoder().encode(label);
    if (bytes.length > MAX_LABEL_BYTES) {
      throw new Error(`Label "${label}" exceeds ${MAX_LABEL_BYTES} bytes when UTF-8 encoded.`);
    }
    return bytes;
  });

  const totalLength =
    encodedLabels.reduce((sum, labelBytes) => sum + 1 + labelBytes.length, 0) + 1; // +1 length byte per label, +1 terminator

  const out = new Uint8Array(totalLength);
  let offset = 0;
  for (const labelBytes of encodedLabels) {
    out[offset] = labelBytes.length;
    offset += 1;
    out.set(labelBytes, offset);
    offset += labelBytes.length;
  }
  out[offset] = 0;

  return bytesToHex(out);
}

/**
 * Inverse of `dnsEncodeName`. Primarily useful for tests and for sanity
 * checks against wallet/explorer-decoded calldata during demo debugging.
 */
export function decodeDnsName(encoded: `0x${string}`): string {
  const bytes = hexToBytes(encoded);
  const labels: string[] = [];
  let offset = 0;

  while (offset < bytes.length) {
    // Defensive: unreachable in practice, since the `while` condition above
    // guarantees `offset < bytes.length` here — kept because
    // `noUncheckedIndexedAccess` types the access as possibly `undefined`.
    const length = bytes[offset];
    if (length === undefined) {
      throw new Error("Malformed DNS-encoded name: unexpected end of buffer.");
    }
    offset += 1;

    if (length === 0) {
      return labels.join(".");
    }
    if (offset + length > bytes.length) {
      throw new Error("Malformed DNS-encoded name: label length exceeds buffer.");
    }

    labels.push(new TextDecoder().decode(bytes.slice(offset, offset + length)));
    offset += length;
  }

  throw new Error("Malformed DNS-encoded name: missing terminating zero byte.");
}

function assertSimpleAsciiLabel(label: string): void {
  if (!SIMPLE_LABEL_PATTERN.test(label)) {
    throw new Error(
      `Label "${label}" is not a simple lowercase ASCII alphanumeric-and-hyphen label. ` +
        `Run full ENSIP-15 normalization before encoding labels outside this charset.`,
    );
  }
}
