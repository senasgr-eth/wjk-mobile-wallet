/**
 * Parse WojakCoin BIP21 URI or plain address.
 * Format: wojakcoin:ADDRESS or wojakcoin:ADDRESS?amount=X
 */

export interface ParsedQr {
  address: string;
  amountWjk?: number;
}

export interface ParseResult {
  parsed: ParsedQr | null;
  error?: string;
}

/** Base58 chars (excludes 0, O, I, l). W addresses use base58. */
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]+$/;

/**
 * Allowed address prefixes:
 * - "W": legacy P2PKH (pubKeyHash 0x49), single-key wallet address
 * - "3": P2SH (scriptHash 0x05), used for multisig
 */
export const ADDRESS_PREFIXES = ["W", "3"] as const;

/** True if the address starts with a supported prefix (W or 3). */
export function hasValidAddressPrefix(addr: string): boolean {
  return ADDRESS_PREFIXES.some((p) => addr.startsWith(p));
}

function isValidBase58Address(addr: string): boolean {
  return addr.length >= 26 && addr.length <= 35 && BASE58.test(addr);
}

/** Sanitize QR output: trim, remove control chars, normalize whitespace. */
export function sanitizeQrInput(text: string): string {
  return text
    .replace(/[\x00-\x1f\x7f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Parse and return a detailed error reason when parsing fails. */
export function parseWojakCoinQrWithReason(text: string): ParseResult {
  const trimmed = sanitizeQrInput(text);
  if (!trimmed) return { parsed: null, error: "Empty input" };

  const wojakPrefix = "wojakcoin:";
  if (trimmed.toLowerCase().startsWith(wojakPrefix)) {
    // Some generators use `wojakcoin://ADDRESS`; normalize to `wojakcoin:ADDRESS`.
    const rawRest = trimmed.slice(wojakPrefix.length);
    const rest = rawRest.startsWith("//") ? rawRest.slice(2) : rawRest;
    const [addrPart, query] = rest.split("?");
    const address = addrPart.trim().replace(/\s+/g, "");
    if (!address) return { parsed: null, error: "wojakcoin: URI has no address" };
    if (!hasValidAddressPrefix(address)) return { parsed: null, error: "wojakcoin: address must start with 'W' or '3'" };
    if (!isValidBase58Address(address)) return { parsed: null, error: "wojakcoin: invalid address format" };

    let amountWjk: number | undefined;
    if (query) {
      const params = new URLSearchParams(query);
      const amt = params.get("amount");
      if (amt) {
        const parsed = parseFloat(amt);
        if (isNaN(parsed)) return { parsed: null, error: `wojakcoin: invalid amount "${amt}" (not a number)` };
        if (parsed < 0) return { parsed: null, error: `wojakcoin: amount must be >= 0, got ${parsed}` };
        amountWjk = parsed;
      }
    }

    return { parsed: { address, amountWjk } };
  }

  const compact = trimmed.replace(/\s+/g, "");
  if (hasValidAddressPrefix(compact)) {
    if (!isValidBase58Address(compact)) return { parsed: null, error: "Invalid address format" };
    return { parsed: { address: compact } };
  }

  return {
    parsed: null,
    error: "Expected wojakcoin:ADDRESS or plain W.../3... address (got neither)",
  };
}

export function parseWojakCoinQr(text: string): ParsedQr | null {
  return parseWojakCoinQrWithReason(text).parsed;
}
