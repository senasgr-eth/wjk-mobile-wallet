/**
 * Parse WojakCoin / bridge BIP21 URI, JSON payload, or plain address.
 *
 * Supported formats:
 * 1. JSON: {"address":"...","amount":"...","opreturn":"...","opreturn_hex":"..."}
 * 2. URI scheme: wojakcoin:ADDRESS or junkcoin:ADDRESS?amount=X&opreturn=...&opreturn_hex=...
 * 3. Plain address (fallback)
 *
 * Bridge QR format (from wjkc_bridge_old DepositFlow.tsx):
 *   wojakcoin:CUSTODY_ADDR?amount=X&opreturn=EVM_HEX_40&opreturn_hex=EVM_HEX_40
 * When opreturn_hex is present the value must be binary-encoded in the tx (not UTF-8).
 */

export interface ParsedQr {
  address: string;
  amountWjk?: number;
  /** OP_RETURN memo/data. When opReturnIsHex=true encode as binary hex bytes. */
  opReturnMemo?: string;
  /** True when the memo came from opreturn_hex — encode as Buffer.from(x,"hex"). */
  opReturnIsHex?: boolean;
}

export interface ParseResult {
  parsed: ParsedQr | null;
  error?: string;
}

/** Base58 chars (excludes 0, O, I, l). W and 3 addresses use base58. */
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]+$/;

/**
 * Allowed address prefixes:
 * - "W": legacy P2PKH (pubKeyHash 0x49), single-key wallet address
 * - "3": P2SH (scriptHash 0x05), used for multisig / bridge custody
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

function pickOpReturn(
  hexMemo: string | null,
  textMemo: string | null
): { opReturnMemo?: string; opReturnIsHex?: boolean } {
  if (hexMemo) return { opReturnMemo: hexMemo, opReturnIsHex: true };
  if (textMemo) return { opReturnMemo: textMemo };
  return {};
}

/** Parse and return a detailed error reason when parsing fails. */
export function parseWojakCoinQrWithReason(text: string): ParseResult {
  const trimmed = sanitizeQrInput(text);
  if (!trimmed) return { parsed: null, error: "Empty input" };

  // ── JSON format ────────────────────────────────────────────────────────────
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const json = JSON.parse(trimmed) as Record<string, string>;
      const address = (json.address ?? "").trim();
      if (address) {
        const hexMemo = json.opreturn_hex ?? null;
        const textMemo =
          json.opreturn ?? json.op_return ?? json.memo ?? json.message ?? null;
        const amtRaw = json.amount;
        let amountWjk: number | undefined;
        if (amtRaw) {
          const n = parseFloat(amtRaw);
          if (!isNaN(n) && n >= 0) amountWjk = n;
        }
        return {
          parsed: { address, amountWjk, ...pickOpReturn(hexMemo, textMemo) },
        };
      }
    } catch {
      // fall through
    }
  }

  // ── URI scheme (wojakcoin: / junkcoin: / any scheme:) ────────────────────
  const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*):(.*)$/.exec(trimmed);
  if (schemeMatch) {
    const rest = schemeMatch[2].startsWith("//")
      ? schemeMatch[2].slice(2)
      : schemeMatch[2];
    const [addrPart, query] = rest.split("?");
    const address = addrPart.trim().replace(/\s+/g, "");
    if (!address) return { parsed: null, error: "URI has no address" };
    if (!hasValidAddressPrefix(address))
      return { parsed: null, error: "Address must start with 'W' or '3'" };
    if (!isValidBase58Address(address))
      return { parsed: null, error: "Invalid address format" };

    let amountWjk: number | undefined;
    let hexMemo: string | null = null;
    let textMemo: string | null = null;

    if (query) {
      const params = new URLSearchParams(query);
      const amt = params.get("amount");
      if (amt) {
        const n = parseFloat(amt);
        if (isNaN(n)) return { parsed: null, error: `Invalid amount "${amt}"` };
        if (n < 0) return { parsed: null, error: "Amount must be >= 0" };
        amountWjk = n;
      }
      hexMemo = params.get("opreturn_hex");
      textMemo =
        params.get("opreturn") ??
        params.get("op_return") ??
        params.get("memo") ??
        params.get("message");
    }

    return {
      parsed: { address, amountWjk, ...pickOpReturn(hexMemo, textMemo) },
    };
  }

  // ── Plain address ──────────────────────────────────────────────────────────
  const compact = trimmed.replace(/\s+/g, "");
  if (hasValidAddressPrefix(compact)) {
    if (!isValidBase58Address(compact))
      return { parsed: null, error: "Invalid address format" };
    return { parsed: { address: compact } };
  }

  return {
    parsed: null,
    error: "Expected wojakcoin: URI, JSON payload, or plain W.../3... address",
  };
}

export function parseWojakCoinQr(text: string): ParsedQr | null {
  return parseWojakCoinQrWithReason(text).parsed;
}
