/**
 * Wojakcoin API Layer (Electrs/Esplora compatible)
 *
 * Communicates with wjk-electrs REST API for Wojakcoin blockchain data.
 * Wojakcoin: legacy P2PKH (W prefix), no SegWit, tx version 1.
 *
 * Configure via .env:
 * - NEXT_PUBLIC_ELECTRS_API_URL: Electrs base URL (default: http://localhost:3001)
 * - NEXT_PUBLIC_BLOCK_EXPLORER_URL: Block explorer for tx/address links
 * - NEXT_PUBLIC_API_PROXY_URL: Optional; base URL that exposes /api/electrs and /api/price.
 * - NEXT_PUBLIC_PRICE_API_URL: Optional; base URL for /api/price (if different from API proxy host).
 */

import { WOJAKCOIN } from "./wojakcoin";

const ELECTRS_API = process.env.NEXT_PUBLIC_ELECTRS_API_URL || WOJAKCOIN.electrsUrl;
const NETWORK = process.env.NEXT_PUBLIC_NETWORK || "mainnet";
const EXPLORER_URL = process.env.NEXT_PUBLIC_BLOCK_EXPLORER_URL || WOJAKCOIN.explorerUrl;
const API_PROXY_BASE = (process.env.NEXT_PUBLIC_API_PROXY_URL ?? WOJAKCOIN.apiProxyUrl ?? "").trim();

function getDetectedWebMountBase(): string {
  if (typeof window === "undefined") return "";
  const path = window.location.pathname || "";
  // Production wallet is commonly mounted at /wallet.
  return path.startsWith("/wallet") ? "/wallet" : "";
}

export async function fetchTextWithStatus(url: string): Promise<{ ok: boolean; status: number; text: string }> {
  const cap = typeof window !== "undefined" ? (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor : undefined;
  const isNative = cap?.isNativePlatform?.() ?? false;

  if (isNative) {
    try {
      const mod = await import("@capacitor-community/http");
      const Http = mod.Http;
      const res = await Http.request({ url, method: "GET", responseType: "text" });
      const text = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
      return { ok: res.status >= 200 && res.status < 300, status: res.status, text };
    } catch (e) {
      return { ok: false, status: 0, text: e instanceof Error ? e.message : "request failed" };
    }
  }

  const res = await fetch(url);
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

/**
 * Resolve Electrs API base URL.
 * In the browser (web): use /api/electrs proxy (same-origin, no CORS).
 * In Capacitor (Android app): use ELECTRS_API directly (no Next server).
 * On server: use ELECTRS_API directly.
 */
function getBaseUrl(): string {
  if (typeof window !== "undefined") {
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    if (cap?.isNativePlatform?.()) {
      if (API_PROXY_BASE) {
        return `${API_PROXY_BASE.replace(/\/+$/, "")}/api/electrs`;
      }
      let electrsUrl = ELECTRS_API;
      if (NETWORK === "testnet" && electrsUrl.includes("/api")) {
        electrsUrl = electrsUrl.replace("/api", "/testnet/api");
      }
      return electrsUrl.replace(/\/+$/, "");
    }
    const base = (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_BASE_PATH) || "";
    const detectedMountBase = getDetectedWebMountBase();
    const proxyBase = API_PROXY_BASE || `${window.location.origin}${detectedMountBase}`;
    return `${proxyBase.replace(/\/+$/, "")}${base}/api/electrs`;
  }
  let url = ELECTRS_API;
  if (NETWORK === "testnet" && url.includes("/api")) {
    url = url.replace("/api", "/testnet/api");
  }
  return url.replace(/\/+$/, "");
}

export function getExplorerTxUrl(txid: string): string {
  return `${EXPLORER_URL}/tx/${txid}`;
}

export function getExplorerAddressUrl(address: string): string {
  return `${EXPLORER_URL}/address/${address}`;
}

// ─── Address Endpoints ───────────────────────────────────────────────────────

export interface AddressInfo {
  address: string;
  chain_stats: {
    funded_txo_count: number;
    funded_txo_sum: number;
    spent_txo_count: number;
    spent_txo_sum: number;
    tx_count: number;
  };
  mempool_stats: {
    funded_txo_count: number;
    funded_txo_sum: number;
    spent_txo_count: number;
    spent_txo_sum: number;
    tx_count: number;
  };
}

export async function getAddressInfo(address: string): Promise<AddressInfo> {
  const res = await fetch(`${getBaseUrl()}/address/${address}`);
  if (!res.ok) throw new Error(`Failed to fetch address info: ${res.statusText}`);
  return res.json();
}

export async function getAddressBalance(address: string): Promise<{
  confirmed: number;
  unconfirmed: number;
  total: number;
}> {
  const info = await getAddressInfo(address);
  const confirmed = info.chain_stats.funded_txo_sum - info.chain_stats.spent_txo_sum;
  const unconfirmed = info.mempool_stats.funded_txo_sum - info.mempool_stats.spent_txo_sum;
  return {
    confirmed,
    unconfirmed,
    total: confirmed + unconfirmed,
  };
}

// ─── Transaction Endpoints ───────────────────────────────────────────────────

export interface TxVin {
  txid: string;
  vout: number;
  prevout: {
    scriptpubkey: string;
    scriptpubkey_address: string;
    scriptpubkey_asm: string;
    scriptpubkey_type: string;
    value: number;
  } | null;
  scriptsig: string;
  witness: string[];
  sequence: number;
}

export interface TxVout {
  scriptpubkey: string;
  scriptpubkey_address: string;
  scriptpubkey_asm: string;
  scriptpubkey_type: string;
  value: number;
}

export interface Transaction {
  txid: string;
  version: number;
  locktime: number;
  vin: TxVin[];
  vout: TxVout[];
  size: number;
  weight: number;
  fee: number;
  status: {
    confirmed: boolean;
    block_height?: number;
    block_hash?: string;
    block_time?: number;
  };
}

export async function getAddressTransactions(
  address: string,
  lastSeenTxid?: string
): Promise<Transaction[]> {
  const url = lastSeenTxid
    ? `${getBaseUrl()}/address/${address}/txs/chain/${lastSeenTxid}`
    : `${getBaseUrl()}/address/${address}/txs`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch transactions: ${res.statusText}`);
  return res.json();
}

export async function getTransaction(txid: string): Promise<Transaction> {
  const res = await fetch(`${getBaseUrl()}/tx/${txid}`);
  if (!res.ok) throw new Error(`Failed to fetch transaction: ${res.statusText}`);
  return res.json();
}

export async function getTxHex(txid: string): Promise<string> {
  const res = await fetch(`${getBaseUrl()}/tx/${txid}/hex`);
  if (!res.ok) throw new Error(`Failed to fetch tx hex: ${res.statusText}`);
  return res.text();
}

// ─── UTXO Endpoints ──────────────────────────────────────────────────────────

export interface UTXO {
  txid: string;
  vout: number;
  status: {
    confirmed: boolean;
    block_height?: number;
    block_hash?: string;
    block_time?: number;
  };
  value: number;
}

export async function getAddressUtxos(address: string): Promise<UTXO[]> {
  const res = await fetch(`${getBaseUrl()}/address/${address}/utxo`);
  if (!res.ok) throw new Error(`Failed to fetch UTXOs: ${res.statusText}`);
  return res.json();
}

// ─── Fee Estimation ──────────────────────────────────────────────────────────

export interface FeeEstimates {
  [confirmationTarget: string]: number;
}

export async function getFeeEstimates(): Promise<FeeEstimates> {
  const res = await fetch(`${getBaseUrl()}/fee-estimates`);
  if (!res.ok) throw new Error(`Failed to fetch fee estimates: ${res.statusText}`);
  return res.json();
}

// ─── Broadcast ───────────────────────────────────────────────────────────────

export async function broadcastTransaction(txHex: string): Promise<string> {
  const res = await fetch(`${getBaseUrl()}/tx`, {
    method: "POST",
    body: txHex,
    headers: { "Content-Type": "text/plain" },
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Broadcast failed: ${errorText}`);
  }
  return res.text(); // returns txid
}

// ─── Block Info ──────────────────────────────────────────────────────────────

export async function getBlockHeight(): Promise<number> {
  const res = await fetch(`${getBaseUrl()}/blocks/tip/height`);
  if (!res.ok) throw new Error(`Failed to fetch block height: ${res.statusText}`);
  const text = await res.text();
  return parseInt(text, 10);
}

export async function getBlockHash(height: number): Promise<string> {
  const res = await fetch(`${getBaseUrl()}/block-height/${height}`);
  if (!res.ok) throw new Error(`Failed to fetch block hash: ${res.statusText}`);
  return res.text();
}

// ─── Price Data ──────────────────────────────────────────────────────────────

const BASE_PATH = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_BASE_PATH ?? "" : "";
const PRICE_CACHE_KEY = "wojak_price_cache";
const PRICE_CACHE_MAX_AGE_MS = 5 * 60 * 1000; // 5 min

export type FiatCurrency =
  | "USD"
  | "EUR"
  | "GBP"
  | "CAD"
  | "AUD"
  | "JPY"
  | "CHF"
  | "CNY"
  | "INR"
  | "KRW"
  | "MXN"
  | "BRL";

export const FIAT_CURRENCIES: { code: FiatCurrency; label: string }[] = [
  { code: "USD", label: "US Dollar" },
  { code: "EUR", label: "Euro" },
  { code: "GBP", label: "British Pound" },
  { code: "JPY", label: "Japanese Yen" },
  { code: "CNY", label: "Chinese Yuan" },
  { code: "CAD", label: "Canadian Dollar" },
  { code: "AUD", label: "Australian Dollar" },
  { code: "CHF", label: "Swiss Franc" },
  { code: "INR", label: "Indian Rupee" },
  { code: "KRW", label: "South Korean Won" },
  { code: "MXN", label: "Mexican Peso" },
  { code: "BRL", label: "Brazilian Real" },
];

function getCachedPrice(currency: string): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem(`${PRICE_CACHE_KEY}_${currency.toUpperCase()}`);
    if (!raw) return 0;
    const { rate, ts } = JSON.parse(raw) as { rate?: number; ts?: number };
    if (typeof rate !== "number" || rate <= 0) return 0;
    if (typeof ts === "number" && Date.now() - ts > PRICE_CACHE_MAX_AGE_MS) return 0;
    return rate;
  } catch {
    return 0;
  }
}

function setCachedPrice(rate: number, currency: string): void {
  if (typeof window === "undefined" || rate <= 0) return;
  try {
    localStorage.setItem(
      `${PRICE_CACHE_KEY}_${currency.toUpperCase()}`,
      JSON.stringify({ rate, ts: Date.now() })
    );
  } catch {}
}

/** Returns cached price for currency if valid (for instant display). */
export function getCachedCoinPrice(currency: string = "USD"): number {
  return getCachedPrice(currency);
}

async function fetchPriceFromConfiguredApi(url: string): Promise<number> {
  try {
    const { ok, status, text } = await fetchTextWithStatus(url);
    if (!ok) return 0;
    const data = JSON.parse(text || "{}") as { rate?: number; error?: string };
    if (typeof data?.rate !== "number") return 0;
    const rate = data.rate;
    return rate > 0 ? rate : 0;
  } catch {
    return 0;
  }
}

/** Fetches WJK price from proxied /api/price. Updates client cache. */
export async function getCoinPrice(currency: string = "USD"): Promise<number> {
  const code = (currency || "USD").toUpperCase();
  const cap = typeof window !== "undefined" ? (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor : undefined;
  const isNative = cap?.isNativePlatform?.() ?? false;
  const priceBase = (process.env.NEXT_PUBLIC_PRICE_API_URL ?? "").trim();

  let primaryUrl: string | null = null;
  if (typeof window !== "undefined") {
    const basePath = (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_BASE_PATH) || "";
    const detectedMountBase = getDetectedWebMountBase();
    const defaultProxyBase = API_PROXY_BASE || `${window.location.origin}${detectedMountBase}`;
    if (isNative) {
      const nativeBase = priceBase || API_PROXY_BASE;
      if (nativeBase) {
        primaryUrl = `${nativeBase.replace(/\/+$/, "")}/api/price?currency=${encodeURIComponent(code)}`;
      }
    } else {
      const webBase = priceBase || defaultProxyBase;
      primaryUrl = `${webBase.replace(/\/+$/, "")}${basePath}/api/price?currency=${encodeURIComponent(code)}`;
    }
  } else {
    const base = priceBase || API_PROXY_BASE || (process.env.NEXT_PUBLIC_APP_URL ?? "").trim();
    if (base) {
      primaryUrl = `${base.replace(/\/+$/, "")}${BASE_PATH}/api/price?currency=${encodeURIComponent(code)}`;
    }
  }

  const rate = primaryUrl ? await fetchPriceFromConfiguredApi(primaryUrl) : 0;
  if (rate > 0) setCachedPrice(rate, code);
  return rate > 0 ? rate : getCachedPrice(code);
}

/** Format amount in fiat (e.g. balance or price) for display. */
export function formatFiat(amount: number, currency: string): string {
  const code = (currency || "USD").toUpperCase();
  const opts: Intl.NumberFormatOptions = {
    style: "currency",
    currency: code,
    minimumFractionDigits: amount >= 1 ? 2 : 4,
    maximumFractionDigits: amount >= 1 ? 2 : 8,
  };
  return amount.toLocaleString(undefined, opts);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const UNITS = WOJAKCOIN.unitsPerCoin;

export function satsToWjk(sats: number): number {
  return sats / UNITS;
}

export function wjkToSats(wjk: number): number {
  return Math.round(wjk * UNITS);
}

export function formatWjk(sats: number, decimals = 8): string {
  return satsToWjk(sats).toFixed(decimals);
}

export function formatSats(sats: number): string {
  return new Intl.NumberFormat().format(sats);
}

export function shortenTxid(txid: string, chars = 8): string {
  return `${txid.slice(0, chars)}...${txid.slice(-chars)}`;
}

export function shortenAddress(address: string, chars = 8): string {
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

// Legacy aliases for compatibility
export const satsToBtc = satsToWjk;
export const btcToSats = wjkToSats;
export const formatBtc = formatWjk;

export { NETWORK, EXPLORER_URL, WOJAKCOIN };
