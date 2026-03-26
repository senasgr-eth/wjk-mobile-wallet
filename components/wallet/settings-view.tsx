"use client";

import { useState } from "react";
import { Shield, Server, Copy, Check, Wallet, AlertTriangle, Key, Eye, EyeOff, Languages, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWallet } from "@/lib/wallet-context";
import { deleteWallet, STORAGE_BACKEND, isWalletEncrypted } from "@/lib/wallet-storage";
import { copyToClipboard } from "@/lib/clipboard";
import { HardDrive } from "lucide-react";
import { useLocale } from "@/lib/i18n/locale-provider";
import { locales, localeLabels, type Locale } from "@/lib/i18n/messages";
import { WOJAKCOIN } from "@/lib/wojakcoin";

export function SettingsView() {
  const { t, locale, setLocale } = useLocale();
  const { network, address, utxos, getPrivateKey, blockHeight, coinPrice } = useWallet();
  const [electrsUrl, setElectrsUrl] = useState("https://api.wojakcoin.cash");
  const [explorerUrl, setExplorerUrl] = useState("https://explorer.wojakcoin.cash");
  const [copied, setCopied] = useState(false);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);
  const [isTestingApi, setIsTestingApi] = useState(false);
  const [electrsStatus, setElectrsStatus] = useState<string>("not tested");
  const [priceStatus, setPriceStatus] = useState<string>("not tested");

  const getDebugApiUrls = () => {
    const isNative =
      typeof window !== "undefined" &&
      !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();

    const envProxy = (process.env.NEXT_PUBLIC_API_PROXY_URL ?? "").trim();
    const envPrice = (process.env.NEXT_PUBLIC_PRICE_API_URL ?? "").trim();
    const envElectrs = (process.env.NEXT_PUBLIC_ELECTRS_API_URL ?? "").trim();
    const detectedWebMount =
      typeof window !== "undefined" && window.location.pathname.startsWith("/wallet") ? "/wallet" : "";
    const webProxyBase =
      envProxy || (typeof window !== "undefined" ? `${window.location.origin}${detectedWebMount}` : "");
    const nativeProxyBase = envProxy || WOJAKCOIN.apiProxyUrl;

    const electrsBase = isNative
      ? (nativeProxyBase ? `${nativeProxyBase}/api/electrs` : (envElectrs || WOJAKCOIN.electrsUrl))
      : `${webProxyBase}/api/electrs`;
    const priceBase = isNative
      ? (envPrice || nativeProxyBase)
      : (envPrice || webProxyBase);

    return {
      electrsUrl: `${electrsBase.replace(/\/+$/, "")}/blocks/tip/height`,
      priceUrl: `${(priceBase || "").replace(/\/+$/, "")}/api/price?currency=USD`,
      isNative,
    };
  };

  const { electrsUrl: debugElectrsUrl, priceUrl: debugPriceUrl, isNative: debugIsNative } = getDebugApiUrls();

  const runApiDiagnostics = async () => {
    setIsTestingApi(true);
    setElectrsStatus("testing...");
    setPriceStatus("testing...");
    try {
      const electrsRes = await fetch(debugElectrsUrl, { cache: "no-store" });
      const electrsText = await electrsRes.text();
      setElectrsStatus(
        electrsRes.ok ? `ok (${electrsRes.status}) height=${electrsText}` : `fail (${electrsRes.status}) ${electrsText.slice(0, 80)}`
      );
    } catch (e) {
      setElectrsStatus(`error: ${e instanceof Error ? e.message : "request failed"}`);
    }

    try {
      if (!debugPriceUrl.startsWith("http")) {
        setPriceStatus("fail: no price base URL resolved");
      } else {
        const priceRes = await fetch(debugPriceUrl, { cache: "no-store" });
        const priceText = await priceRes.text();
        setPriceStatus(
          priceRes.ok ? `ok (${priceRes.status}) ${priceText.slice(0, 120)}` : `fail (${priceRes.status}) ${priceText.slice(0, 80)}`
        );
      }
    } catch (e) {
      setPriceStatus(`error: ${e instanceof Error ? e.message : "request failed"}`);
    }
    setIsTestingApi(false);
  };

  const handleCopyAddress = async () => {
    await copyToClipboard(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDeleteWallet = () => {
    if (typeof window !== "undefined" && confirm(t("settings.delete_confirm"))) {
      deleteWallet();
      window.location.reload();
    }
  };

  const handleCopyPrivateKey = async () => {
    const wif = getPrivateKey();
    if (wif) {
      await copyToClipboard(wif);
      setKeyCopied(true);
      setTimeout(() => setKeyCopied(false), 2000);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">{t("settings.title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("settings.subtitle")}</p>
      </div>

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="general" className="text-xs">{t("settings.tab_general")}</TabsTrigger>
          <TabsTrigger value="network" className="text-xs">{t("settings.tab_network")}</TabsTrigger>
          <TabsTrigger value="utxos" className="text-xs">{t("settings.tab_utxos")}</TabsTrigger>
          <TabsTrigger value="security" className="text-xs">{t("settings.tab_security")}</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Languages className="h-4 w-4 text-primary" />
                {t("settings.language_title")}
              </CardTitle>
              <CardDescription className="text-xs">{t("settings.language_desc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Label className="text-xs text-muted-foreground shrink-0">{t("settings.language_title")}</Label>
                <Select
                  value={locale}
                  onValueChange={(v) => setLocale(v as Locale)}
                >
                  <SelectTrigger className="w-full sm:min-w-[260px] sm:max-w-[min(100%,320px)] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {locales.map((loc) => (
                      <SelectItem key={loc} value={loc} className="text-xs">
                        {localeLabels[loc]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Wallet className="h-4 w-4 text-primary" />
                {t("settings.wallet_card")}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{t("settings.network_label")}</p>
                  <p className="text-xs text-muted-foreground">{t("settings.network_name")}</p>
                </div>
                <Badge variant="secondary" className="capitalize">{network}</Badge>
              </div>
              <Separator />
              <div className="flex flex-col gap-2">
                <Label className="text-xs text-muted-foreground">{t("settings.address")}</Label>
                <div className="flex gap-2">
                  <Input readOnly value={address} className="font-mono text-xs" />
                  <Button variant="outline" size="icon" onClick={handleCopyAddress}>
                    {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                    <span className="sr-only">{t("settings.copy")}</span>
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">{t("settings.address_hint")}</p>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{t("settings.address_type")}</p>
                  <p className="text-xs text-muted-foreground">{t("settings.address_type_desc")}</p>
                </div>
                <Badge variant="outline">{t("settings.p2pkh")}</Badge>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <HardDrive className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-foreground">{t("settings.storage")}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("settings.storage_desc")}
                    </p>
                  </div>
                </div>
                <Badge variant="secondary" className="capitalize">
                  {isWalletEncrypted() ? `${STORAGE_BACKEND} (encrypted)` : `${STORAGE_BACKEND} (plain)`}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="network" className="mt-4">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Server className="h-4 w-4 text-primary" />
                  {t("settings.electrs_api")}
                </CardTitle>
                <CardDescription className="text-xs">
                  {t("settings.electrs_desc")}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label className="text-xs text-muted-foreground">{t("settings.electrs_url")}</Label>
                  <Input value={electrsUrl} readOnly className="font-mono text-xs" />
                </div>
                <div className="flex flex-col gap-2">
                  <Label className="text-xs text-muted-foreground">{t("settings.block_explorer")}</Label>
                  <Input value={explorerUrl} readOnly className="font-mono text-xs" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">API Debug</CardTitle>
                <CardDescription className="text-xs">
                  Use this on device to verify which endpoints the app is calling and what they return.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-xs text-muted-foreground">
                  Platform: <span className="font-mono text-foreground">{debugIsNative ? "native" : "web"}</span>
                </div>
                <div className="flex flex-col gap-2">
                  <Label className="text-xs text-muted-foreground">Resolved Electrs URL</Label>
                  <Input value={debugElectrsUrl} readOnly className="font-mono text-xs" />
                </div>
                <div className="flex flex-col gap-2">
                  <Label className="text-xs text-muted-foreground">Resolved Price URL</Label>
                  <Input value={debugPriceUrl || "(none)"} readOnly className="font-mono text-xs" />
                </div>
                <Button variant="outline" size="sm" className="gap-2" onClick={runApiDiagnostics} disabled={isTestingApi}>
                  <RefreshCw className={`h-4 w-4 ${isTestingApi ? "animate-spin" : ""}`} />
                  {isTestingApi ? "Testing..." : "Run diagnostics"}
                </Button>
                <div className="space-y-1 text-xs">
                  <p><span className="text-muted-foreground">Electrs:</span> <span className="font-mono">{electrsStatus}</span></p>
                  <p><span className="text-muted-foreground">Price:</span> <span className="font-mono">{priceStatus}</span></p>
                  <p><span className="text-muted-foreground">Current wallet state:</span> <span className="font-mono">blockHeight={blockHeight} price={coinPrice}</span></p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="utxos" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{t("settings.utxos_title")}</CardTitle>
              <CardDescription className="text-xs">{t("settings.utxos_count", { count: utxos.length })}</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {utxos.map((utxo) => (
                  <div key={`${utxo.txid}:${utxo.vout}`} className="flex items-center justify-between px-6 py-3">
                    <div className="flex flex-col gap-0.5">
                      <p className="text-xs font-mono text-foreground truncate max-w-[200px]">
                        {utxo.txid.slice(0, 16)}...:{utxo.vout}
                      </p>
                      {utxo.status.confirmed ? (
                        <Badge variant="secondary" className="text-[9px] w-fit">Block #{utxo.status.block_height}</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[9px] w-fit border-primary/30 text-primary">{t("settings.unconfirmed")}</Badge>
                      )}
                    </div>
                    <span className="text-sm font-mono font-bold">{(utxo.value / 100_000_000).toFixed(8)} WJK</span>
                  </div>
                ))}
                {utxos.length === 0 && (
                  <div className="px-6 py-8 text-center text-sm text-muted-foreground">{t("settings.no_utxos")}</div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Key className="h-4 w-4 text-primary" />
                {t("settings.private_key")}
              </CardTitle>
              <CardDescription className="text-xs">
                {t("settings.private_key_desc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <div className="flex gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" />
                  <p className="text-xs text-amber-800 dark:text-amber-200">
                    {t("settings.key_warning")}
                  </p>
                </div>
              </div>
              {showPrivateKey ? (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">{t("settings.private_key_wif")}</Label>
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={getPrivateKey() ?? ""}
                      className="font-mono text-xs"
                      type="text"
                    />
                    <Button variant="outline" size="icon" onClick={handleCopyPrivateKey}>
                      {keyCopied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                      <span className="sr-only">{t("settings.copy")}</span>
                    </Button>
                    <Button variant="outline" size="icon" onClick={() => setShowPrivateKey(false)}>
                      <EyeOff className="h-4 w-4" />
                      <span className="sr-only">Hide</span>
                    </Button>
                  </div>
                </div>
              ) : (
                <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowPrivateKey(true)}>
                  <Eye className="h-4 w-4" />
                  {t("settings.reveal_key")}
                </Button>
              )}
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Shield className="h-4 w-4 text-primary" />
                {t("settings.danger_zone")}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <div className="flex gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  <p className="text-xs text-destructive">
                    {t("settings.danger_desc")}
                  </p>
                </div>
              </div>
              <Button variant="destructive" size="sm" onClick={handleDeleteWallet}>
                {t("settings.delete_wallet")}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
