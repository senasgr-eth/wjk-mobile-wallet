"use client";

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import type { Transaction, UTXO } from "./wojakcoin-api";
import type { FiatCurrency } from "./wojakcoin-api";
import {
  getAddressBalance,
  getAddressTransactions,
  getAddressUtxos,
  getBlockHeight,
  getFeeEstimates,
  getTxHex,
  broadcastTransaction,
  getCoinPrice,
  getCachedCoinPrice,
} from "./wojakcoin-api";
import { addressFromWif, buildAndSignTx } from "./wojakcoin-crypto";
import { saveWallet, loadWallet, hasWallet } from "./wallet-storage";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface WalletState {
  isLoaded: boolean;
  isLocked: boolean;
  hasStoredWallet: boolean;
  address: string;
  network: string;
  balanceConfirmed: number;
  balanceUnconfirmed: number;
  balanceTotal: number;
  transactions: Transaction[];
  utxos: UTXO[];
  blockHeight: number;
  feeEstimates: Record<string, number>;
  lastSynced: Date | null;
  coinPrice: number;
  fiatCurrency: FiatCurrency;
  isSyncing: boolean;
}

interface WalletContextType extends WalletState {
  refreshWallet: () => Promise<void>;
  unlockWallet: (password: string, staySignedIn?: boolean) => Promise<boolean>;
  lockWallet: () => void;
  createWallet: (wif: string, password: string) => Promise<void>;
  importWallet: (wif: string, password: string) => Promise<void>;
  sendTransaction: (toAddress: string, amountSats: number, feeRate: number, opReturn?: string) => Promise<string>;
  setActiveView: (view: WalletView) => void;
  activeView: WalletView;
  getPrivateKey: () => string | null;
  presetRecipientAddress: string | null;
  setPresetRecipientAddress: (addr: string | null) => void;
  staySignedIn: boolean;
  setFiatCurrency: (currency: FiatCurrency) => void;
}

export type WalletView = "dashboard" | "send" | "receive" | "transactions" | "settings" | "addressbook";

// ─── Context ─────────────────────────────────────────────────────────────────

const STAY_SIGNED_IN_KEY = "wojak_stay_signed_in";
const SESSION_WIF_KEY = "wojak_session_wif";
const FIAT_CURRENCY_KEY = "wojak_fiat_currency";
const DEFAULT_FIAT: FiatCurrency = "USD";
/** Auto-lock delay when stay-signed-in is enabled */
const INACTIVITY_MS = 3 * 60 * 1000;

function getStoredFiatCurrency(): FiatCurrency {
  if (typeof window === "undefined") return DEFAULT_FIAT;
  try {
    const s = localStorage.getItem(FIAT_CURRENCY_KEY)?.toUpperCase();
    const allowed: FiatCurrency[] = ["USD", "EUR", "GBP", "CAD", "AUD", "JPY", "CHF", "CNY", "INR", "KRW", "MXN", "BRL"];
    if (s && allowed.includes(s as FiatCurrency)) return s as FiatCurrency;
  } catch {}
  return DEFAULT_FIAT;
}

function setStoredFiatCurrency(currency: FiatCurrency): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(FIAT_CURRENCY_KEY, currency);
  } catch {}
}

function getStaySignedIn(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(STAY_SIGNED_IN_KEY) === "1";
  } catch {
    return false;
  }
}

function setStaySignedInPref(value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STAY_SIGNED_IN_KEY, value ? "1" : "0");
  } catch {}
}

// Store decrypted session material only in sessionStorage (tab-scoped).
// This avoids persisting decrypted WIF in localStorage across browser restarts/tabs.
function getSessionWif(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(SESSION_WIF_KEY);
  } catch {
    return null;
  }
}

function setSessionWif(wif: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (wif) sessionStorage.setItem(SESSION_WIF_KEY, wif);
    else sessionStorage.removeItem(SESSION_WIF_KEY);
  } catch {}
  // Purge legacy insecure location if it exists.
  try {
    localStorage.removeItem(SESSION_WIF_KEY);
  } catch {}
}

const WalletContext = createContext<WalletContextType | null>(null);

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLocked, setIsLocked] = useState(true);
  const [hasStoredWallet, setHasStoredWallet] = useState(false);
  const [wif, setWif] = useState<string | null>(null);
  const [address, setAddress] = useState("");
  const [balanceConfirmed, setBalanceConfirmed] = useState(0);
  const [balanceUnconfirmed, setBalanceUnconfirmed] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [utxos, setUtxos] = useState<UTXO[]>([]);
  const [blockHeight, setBlockHeight] = useState(0);
  const [feeEstimates, setFeeEstimates] = useState<Record<string, number>>({});
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [activeView, setActiveView] = useState<WalletView>("dashboard");
  const [presetRecipientAddress, setPresetRecipientAddress] = useState<string | null>(null);
  const [staySignedIn, setStaySignedInState] = useState(false);
  const [fiatCurrency, setFiatCurrencyState] = useState<FiatCurrency>(() => getStoredFiatCurrency());
  const [coinPrice, setCoinPrice] = useState(() => getCachedCoinPrice(getStoredFiatCurrency()));
  const [isSyncing, setIsSyncing] = useState(false);

  const fetchWalletData = useCallback(async (addr: string) => {
    try {
      const [bal, txs, utxoList, height, feesResult] = await Promise.all([
        getAddressBalance(addr),
        getAddressTransactions(addr),
        getAddressUtxos(addr),
        getBlockHeight(),
        getFeeEstimates().catch(() => ({})),
      ]);
      setBalanceConfirmed(bal.confirmed);
      setBalanceUnconfirmed(bal.unconfirmed);
      setTransactions(Array.isArray(txs) ? txs : (txs as { transactions?: Transaction[] }).transactions || []);
      setUtxos(Array.isArray(utxoList) ? utxoList : (utxoList as { utxos?: UTXO[] }).utxos || []);
      setBlockHeight(height);
      setFeeEstimates(
        Object.keys(feesResult).length > 0 ? feesResult : { "1": 12, "3": 10, "6": 8, "12": 6 }
      );
      setLastSynced(new Date());
    } catch (e) {
      console.error("Failed to fetch wallet data:", e);
    }
  }, []);

  const refreshWalletDataInBackground = useCallback((addr: string) => {
    // Do not block unlock/create/import on network availability.
    fetchWalletData(addr).catch((e) => {
      console.error("Background wallet sync failed:", e);
    });
  }, [fetchWalletData]);

  const setFiatCurrency = useCallback((currency: FiatCurrency) => {
    setStoredFiatCurrency(currency);
    setFiatCurrencyState(currency);
    getCoinPrice(currency).then((p) => setCoinPrice(p));
  }, []);

  const refreshWallet = useCallback(async () => {
    setIsSyncing(true);
    try {
      const pricePromise = getCoinPrice(fiatCurrency).then((p) => setCoinPrice(p));
      if (address) {
        try {
          await fetchWalletData(address);
        } catch (e) {
          console.error("Sync failed:", e);
        }
      }
      await pricePromise;
    } finally {
      setIsSyncing(false);
    }
  }, [address, fetchWalletData, fiatCurrency]);

  const unlockWallet = useCallback(
    async (password: string, staySignedInOpt?: boolean): Promise<boolean> => {
      try {
        const decryptedWif = await loadWallet(password);
        const addr = addressFromWif(decryptedWif);
        const ss = staySignedInOpt ?? getStaySignedIn();
        setStaySignedInPref(ss);
        setStaySignedInState(ss);
        staySignedInRef.current = ss;
        if (ss) setSessionWif(decryptedWif);
        else setSessionWif(null);
        setWif(decryptedWif);
        setAddress(addr);
        setIsLocked(false);
        refreshWalletDataInBackground(addr);
        return true;
      } catch {
        return false;
      }
    },
    [refreshWalletDataInBackground]
  );

  const lockWallet = useCallback(() => {
    setSessionWif(null);
    setWif(null);
    setIsLocked(true);
  }, []);

  const createWallet = useCallback(
    async (newWif: string, password: string) => {
      await saveWallet(newWif, password);
      const addr = addressFromWif(newWif);
      setHasStoredWallet(true);
      if (getStaySignedIn()) setSessionWif(newWif);
      setWif(newWif);
      setAddress(addr);
      setIsLocked(false);
      refreshWalletDataInBackground(addr);
    },
    [refreshWalletDataInBackground]
  );

  const importWallet = useCallback(
    async (newWif: string, password: string) => {
      await saveWallet(newWif, password);
      const addr = addressFromWif(newWif);
      setHasStoredWallet(true);
      if (getStaySignedIn()) setSessionWif(newWif);
      setWif(newWif);
      setAddress(addr);
      setIsLocked(false);
      refreshWalletDataInBackground(addr);
    },
    [refreshWalletDataInBackground]
  );

  const sendTransaction = useCallback(
    async (toAddress: string, amountSats: number, feeRate: number, opReturn?: string): Promise<string> => {
      if (!wif) throw new Error("Wallet locked");
      const utxoList = Array.isArray(utxos) ? utxos : [];
      if (utxoList.length === 0) throw new Error("No UTXOs to spend");

      const totalAvailable = utxoList.reduce((s, u) => s + u.value, 0);
      if (totalAvailable < amountSats) throw new Error("Insufficient balance");

      const selectedUtxos: { tx: UTXO; total: number }[] = [];
      let sum = 0;
      for (const u of utxoList) {
        selectedUtxos.push({ tx: u, total: sum + u.value });
        sum += u.value;
        if (sum >= amountSats) break;
      }
      if (sum < amountSats) throw new Error("Insufficient balance");

      const inputs = await Promise.all(
        selectedUtxos.map(async ({ tx }) => {
          const prevTxHex = await getTxHex(tx.txid);
          return {
            txid: tx.txid,
            vout: tx.vout,
            value: tx.value,
            prevTxHex,
          };
        })
      );

      let txHex: string;
      try {
        txHex = buildAndSignTx(wif, inputs, [{ address: toAddress, value: amountSats }], feeRate, opReturn);
      } catch (buildErr) {
        console.error("[SendTx] buildAndSignTx failed:", buildErr);
        if (buildErr instanceof Error) console.error("[SendTx] build stack:", buildErr.stack);
        console.error("[SendTx] inputs sample:", {
          count: inputs.length,
          first: inputs[0] ? { txid: inputs[0].txid, vout: inputs[0].vout, value: inputs[0].value, prevTxHexLen: inputs[0].prevTxHex?.length } : null,
        });
        throw buildErr;
      }

      let txid: string;
      try {
        txid = await broadcastTransaction(txHex);
      } catch (broadcastErr) {
        console.error("[SendTx] broadcastTransaction failed:", broadcastErr);
        if (broadcastErr instanceof Error) console.error("[SendTx] broadcast stack:", broadcastErr.stack);
        throw broadcastErr;
      }
      await fetchWalletData(address);
      return txid;
    },
    [wif, utxos, address, fetchWalletData]
  );

  useEffect(() => {
    setHasStoredWallet(hasWallet());
    // Ensure no decrypted session WIF remains in legacy localStorage slot.
    try {
      localStorage.removeItem(SESSION_WIF_KEY);
    } catch {}

    const ss = getStaySignedIn();
    setStaySignedInState(ss);
    staySignedInRef.current = ss;

    // Restore session if stay signed in and we have stored WIF
    const sessionWif = getSessionWif();
    if (hasWallet() && ss && sessionWif) {
      try {
        const addr = addressFromWif(sessionWif);
        setWif(sessionWif);
        setAddress(addr);
        setIsLocked(false);
        fetchWalletData(addr).catch(() => {});
      } catch {
        setSessionWif(null);
      }
    }

    setIsLoaded(true);
  }, [fetchWalletData]);

  // Background balance polling (every 45s when unlocked)
  useEffect(() => {
    if (!address || isLocked) return;
    const interval = setInterval(() => {
      fetchWalletData(address).catch(() => {});
    }, 45_000);
    return () => clearInterval(interval);
  }, [address, isLocked, fetchWalletData]);

  // WJK price from LiveCoinWatch (after mount, retry once if 0, then every 5 min)
  useEffect(() => {
    const fetchPrice = () =>
      getCoinPrice(fiatCurrency).then((p) => {
        setCoinPrice(p);
        return p;
      });
    const t = setTimeout(() => {
      fetchPrice().then((p) => {
        if (p === 0) setTimeout(fetchPrice, 3000);
      });
    }, 300);
    const interval = setInterval(fetchPrice, 5 * 60 * 1000);
    return () => {
      clearTimeout(t);
      clearInterval(interval);
    };
  }, [fiatCurrency]);

  // Inactivity auto-lock (3 min when stay signed in)
  const staySignedInRef = useRef(false);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetInactivityTimer = useCallback(() => {
    if (!staySignedInRef.current || isLocked) return;
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    inactivityTimerRef.current = setTimeout(() => {
      lockWallet();
      inactivityTimerRef.current = null;
    }, INACTIVITY_MS);
  }, [isLocked, lockWallet]);

  useEffect(() => {
    if (isLocked) {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
      return;
    }
    const events = ["mousedown", "keydown", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, resetInactivityTimer));
    resetInactivityTimer();
    return () => {
      events.forEach((e) => window.removeEventListener(e, resetInactivityTimer));
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    };
  }, [isLocked, resetInactivityTimer]);

  // Lock on tab hidden when NOT stay signed in
  useEffect(() => {
    if (isLocked) return;
    const handleVisibility = () => {
      if (document.visibilityState === "hidden" && !staySignedInRef.current) {
        lockWallet();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [isLocked, lockWallet]);

  const value: WalletContextType = {
    isLoaded,
    isLocked,
    hasStoredWallet,
    address,
    network: "mainnet",
    balanceConfirmed,
    balanceUnconfirmed,
    balanceTotal: balanceConfirmed + balanceUnconfirmed,
    transactions,
    utxos,
    blockHeight,
    feeEstimates,
    lastSynced,
    coinPrice,
    fiatCurrency,
    isSyncing,
    refreshWallet,
    unlockWallet,
    lockWallet,
    createWallet,
    importWallet,
    sendTransaction,
    setActiveView,
    activeView,
    getPrivateKey: () => wif,
    presetRecipientAddress,
    setPresetRecipientAddress,
    staySignedIn,
    setFiatCurrency,
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}
