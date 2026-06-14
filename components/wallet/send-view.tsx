"use client";

import { useState, useEffect } from "react";
import { Send, AlertTriangle, CheckCircle2, ArrowLeft, Loader2, QrCode } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { useWallet } from "@/lib/wallet-context";
import { formatWjk, wjkToSats, satsToWjk, formatFiat } from "@/lib/wojakcoin-api";
import { addAddress, isInAddressBook } from "@/lib/addressbook-storage";
import { QrScannerModal } from "./qr-scanner-modal";
import { parseWojakCoinQrWithReason, hasValidAddressPrefix } from "@/lib/parse-bip21";
import { useToast } from "@/hooks/use-toast";
import { useLocale } from "@/lib/i18n/locale-provider";

type SendStep = "form" | "confirm" | "success";

export function SendView() {
  const { t } = useLocale();
  const {
    balanceTotal,
    feeEstimates,
    sendTransaction,
    coinPrice,
    fiatCurrency,
    setActiveView,
    presetRecipientAddress,
    setPresetRecipientAddress,
  } = useWallet();

  const [step, setStep] = useState<SendStep>("form");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [scanOpen, setScanOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (presetRecipientAddress) {
      setRecipientAddress(presetRecipientAddress);
      setPresetRecipientAddress(null);
    }
  }, [presetRecipientAddress, setPresetRecipientAddress]);
  const [amountBtc, setAmountBtc] = useState("");
  const [feeRate, setFeeRate] = useState(12);
  const [isSending, setIsSending] = useState(false);
  const [txid, setTxid] = useState("");
  const [error, setError] = useState("");
  const [errorDetail, setErrorDetail] = useState("");
  const [qrDebugLog, setQrDebugLog] = useState<string[]>([]);
  const [showSaveToAddressBook, setShowSaveToAddressBook] = useState(false);
  const [saveToAddressBookName, setSaveToAddressBookName] = useState("");
  const [savedToAddressBook, setSavedToAddressBook] = useState(false);
  const [opReturnEnabled, setOpReturnEnabled] = useState(false);
  const [opReturnMessage, setOpReturnMessage] = useState("");

  const amountSats = wjkToSats(parseFloat(amountBtc) || 0);
  const estimatedSize = 190; // vbytes for 1-in 2-out P2PKH tx
  const feeSats = feeRate * estimatedSize;
  const totalSats = amountSats + feeSats;
  const fiatAmount = satsToWjk(amountSats) * coinPrice;

  const isValid =
    recipientAddress.length >= 26 &&
    hasValidAddressPrefix(recipientAddress) &&
    amountSats > 0 &&
    totalSats <= balanceTotal;

  function handleQrScan(text: string) {
    const raw = `[QR] Raw: ${text.slice(0, 120)}${text.length > 120 ? "..." : ""}`;
    const { parsed, error } = parseWojakCoinQrWithReason(text);
    const parsedStr = parsed ? `[QR] Parsed: ${JSON.stringify(parsed)}` : `[QR] Parse failed: ${error ?? "unknown"}`;
    setQrDebugLog((prev) => [...prev.slice(-4), raw, parsedStr]);
    if (parsed) {
      setRecipientAddress(parsed.address);
      if (parsed.amountWjk !== undefined) {
        setAmountBtc(parsed.amountWjk.toFixed(8));
      }
    }
  }

  function handleMax() {
    const maxSats = balanceTotal - feeSats;
    if (maxSats > 0) {
      setAmountBtc(satsToWjk(maxSats).toFixed(8));
    }
  }

  async function handleConfirmSend() {
    setIsSending(true);
    setError("");
    setErrorDetail("");
    try {
      const resultTxid = await sendTransaction(
        recipientAddress,
        amountSats,
        feeRate,
        opReturnEnabled && opReturnMessage.trim() ? opReturnMessage.trim() : undefined
      );
      setTxid(resultTxid);
      setStep("success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("send.err_tx_failed");
      setError(msg);
      const detailParts: string[] = [];
      if (err instanceof Error && err.name) detailParts.push(`Error type: ${err.name}`);
      if (err instanceof Error && err.stack) detailParts.push(err.stack);
      detailParts.push(`Context: recipient=${recipientAddress.slice(0, 20)}..., amountSats=${amountSats}, feeRate=${feeRate}`);
      setErrorDetail(detailParts.join("\n\n"));
      console.error("[SendTx] Error:", msg);
      console.error("[SendTx] Full error:", err);
      if (err instanceof Error && err.stack) console.error("[SendTx] Stack:", err.stack);
      console.error("[SendTx] Context:", { recipientAddress, amountSats, feeRate });
    } finally {
      setIsSending(false);
    }
  }

  if (step === "success") {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-6 py-12">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
          <CheckCircle2 className="h-8 w-8 text-success" />
        </div>
        <div className="text-center">
          <h2 className="text-xl font-bold text-foreground">{t("send.success_title")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t("send.success_desc")}</p>
        </div>
        <Card className="w-full">
          <CardContent className="p-4">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{t("send.amount_short")}</span>
                <span className="text-sm font-mono font-bold text-foreground">{amountBtc} WJK</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{t("send.fee_short")}</span>
                <span className="text-sm font-mono text-foreground">{formatWjk(feeSats)} WJK</span>
              </div>
              <Separator />
              <div>
                <span className="text-xs text-muted-foreground">{t("send.txid")}</span>
                <p className="mt-1 break-all text-xs font-mono text-foreground">{txid}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <div className="flex flex-col gap-2 w-full">
          {!isInAddressBook(recipientAddress) && !savedToAddressBook && (
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => {
                setSaveToAddressBookName("Sent " + amountBtc + " WJK");
                setShowSaveToAddressBook(true);
              }}
            >
              {t("send.save_contact")}
            </Button>
          )}
          {savedToAddressBook && (
            <p className="text-center text-sm text-muted-foreground">{t("send.saved_book")}</p>
          )}
          <Dialog open={showSaveToAddressBook} onOpenChange={setShowSaveToAddressBook}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{t("send.dialog_save_title")}</DialogTitle>
                <DialogDescription>
                  {t("send.dialog_save_desc")}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-2">
                <div className="grid gap-2">
                  <Label htmlFor="save-ab-name">{t("send.name")}</Label>
                  <Input
                    id="save-ab-name"
                    placeholder={t("send.name_placeholder")}
                    value={saveToAddressBookName}
                    onChange={(e) => setSaveToAddressBookName(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowSaveToAddressBook(false)}>
                  {t("send.cancel")}
                </Button>
                <Button
                  onClick={() => {
                    if (isInAddressBook(recipientAddress)) {
                      toast({
                        title: t("addr.toast_already_title"),
                        description: t("addr.toast_already_desc"),
                        variant: "destructive",
                      });
                      setSavedToAddressBook(true);
                      setShowSaveToAddressBook(false);
                      return;
                    }
                    const added = addAddress(saveToAddressBookName.trim() || t("addr.unnamed"), recipientAddress);
                    setShowSaveToAddressBook(false);
                    if (added) {
                      setSavedToAddressBook(true);
                      toast({
                        title: t("addr.toast_saved_title"),
                        description: saveToAddressBookName.trim() || t("addr.unnamed"),
                      });
                    } else {
                      setSavedToAddressBook(true);
                      toast({
                        title: t("addr.toast_already_title"),
                        description: t("addr.toast_already_desc"),
                        variant: "destructive",
                      });
                    }
                  }}
                >
                  {t("send.save")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <div className="flex gap-3">
            <Button onClick={() => setActiveView("dashboard")} variant="outline" className="flex-1">
              {t("send.dashboard")}
            </Button>
            <Button onClick={() => setActiveView("transactions")} className="flex-1">
              {t("send.tx_history")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (step === "confirm") {
    return (
      <div className="mx-auto max-w-lg">
        <Button variant="ghost" className="mb-4 gap-2 text-muted-foreground" onClick={() => setStep("form")}>
          <ArrowLeft className="h-4 w-4" />
          {t("send.back")}
        </Button>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-primary" />
              {t("send.confirm_title")}
            </CardTitle>
            <CardDescription>{t("send.confirm_desc")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="rounded-lg border border-border bg-secondary/50 p-4">
              <div className="flex flex-col gap-3">
                <div>
                  <span className="text-xs text-muted-foreground">{t("send.recipient_label")}</span>
                  <p className="mt-1 break-all text-sm font-mono text-foreground">{recipientAddress}</p>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{t("send.amount_label")}</span>
                  <span className="text-sm font-mono font-bold text-foreground">{amountBtc} WJK</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{t("send.network_fee")}</span>
                  <span className="text-sm font-mono text-foreground">{formatWjk(feeSats)} WJK</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{t("send.fee_rate_label")}</span>
                  <span className="text-sm font-mono text-foreground">{feeRate} sat/vB</span>
                </div>
                {opReturnEnabled && opReturnMessage.trim() && (
                  <>
                    <Separator />
                    <div>
                      <span className="text-xs text-muted-foreground">{t("send.op_return_label")}</span>
                      <p className="mt-1 break-all text-sm font-mono text-foreground">{opReturnMessage.trim()}</p>
                    </div>
                  </>
                )}
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">{t("send.total_label")}</span>
                  <span className="text-sm font-mono font-bold text-primary">{formatWjk(totalSats)} WJK</span>
                </div>
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
                <p className="text-sm font-medium text-destructive">{error}</p>
                {errorDetail && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-destructive/80 hover:text-destructive">{t("send.show_details")}</summary>
                    <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-black/20 p-2 text-[10px] text-destructive/90">
                      {errorDetail}
                    </pre>
                  </details>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setStep("form")} disabled={isSending}>
                {t("send.cancel")}
              </Button>
              <Button className="flex-1 gap-2" onClick={handleConfirmSend} disabled={isSending}>
                {isSending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {isSending ? t("send.broadcasting") : t("send.send_btn")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-foreground">{t("send.title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("send.available")} <span className="font-mono font-semibold text-foreground">{formatWjk(balanceTotal)} WJK</span>
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-5 p-6">
          {/* Recipient */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="recipient" className="text-xs font-medium text-muted-foreground">
                {t("send.recipient_address")}
              </Label>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => setScanOpen(true)}
                  title={t("send.scan_qr")}
                >
                  <QrCode className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto px-2 py-0.5 text-xs text-primary"
                  onClick={() => setActiveView("addressbook")}
                >
                  {t("nav.addressbook")}
                </Button>
              </div>
            </div>
            <Input
              id="recipient"
              placeholder="Wjngi9yNyLCMzXfWZpRgHPKQ..."
              value={recipientAddress}
              onChange={(e) => setRecipientAddress(e.target.value)}
              className="font-mono text-sm"
            />
          </div>
          <QrScannerModal
            open={scanOpen}
            onOpenChange={setScanOpen}
            onScan={handleQrScan}
            onError={(err) =>
              setQrDebugLog((prev) => [
                ...prev.slice(-2),
                `[QR] Scanner error: ${err instanceof Error ? err.message : String(err)}`,
              ])
            }
            title={t("send.scan_title")}
            description={t("send.scan_desc")}
          />
          {qrDebugLog.length > 0 && (
            <div className="rounded border border-amber-500/50 bg-amber-500/5 p-2 font-mono text-[10px] text-muted-foreground">
              <div className="mb-1 font-medium text-amber-600 dark:text-amber-400">{t("send.qr_debug")}</div>
              {qrDebugLog.map((line, i) => (
                <div key={i} className="break-all">
                  {line}
                </div>
              ))}
            </div>
          )}

          {/* Amount */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="amount" className="text-xs font-medium text-muted-foreground">
                {t("send.amount_wjk")}
              </Label>
              <Button variant="ghost" size="sm" className="h-auto px-2 py-0.5 text-xs text-primary" onClick={handleMax}>
                {t("send.max")}
              </Button>
            </div>
            <Input
              id="amount"
              type="number"
              step="0.00000001"
              min="0"
              placeholder={t("send.placeholder_amount")}
              value={amountBtc}
              onChange={(e) => setAmountBtc(e.target.value)}
              className="font-mono text-sm"
            />
            {amountSats > 0 && (
              <p className="text-xs text-muted-foreground">
                {"~"}{formatFiat(fiatAmount, fiatCurrency)}
              </p>
            )}
          </div>

          {/* Fee Rate */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-muted-foreground">{t("send.fee_rate")}</Label>
              <span className="text-xs font-mono text-foreground">{feeRate} sat/vB</span>
            </div>
            <Slider
              value={[feeRate]}
              onValueChange={([v]) => setFeeRate(v)}
              min={1}
              max={100}
              step={1}
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>{t("send.economy")}</span>
              <span>{t("send.normal")}</span>
              <span>{t("send.priority")}</span>
            </div>
            <div className="flex gap-2">
              {Object.entries(feeEstimates).slice(0, 3).map(([target, rate]) => (
                <Button
                  key={target}
                  variant={feeRate === rate ? "default" : "outline"}
                  size="sm"
                  className="flex-1 text-xs"
                  onClick={() => setFeeRate(rate)}
                >
                  {target === "1" ? t("send.fast") : target === "3" ? t("send.medium") : t("send.slow")}
                  <span className="ml-1 text-[10px] opacity-70">{rate}</span>
                </Button>
              ))}
            </div>
          </div>

          {/* Summary */}
          {amountSats > 0 && (
            <div className="rounded-lg border border-border bg-secondary/50 p-3">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{t("send.network_fee")}</span>
                  <span className="text-xs font-mono text-foreground">{formatWjk(feeSats)} WJK</span>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">{t("send.total_label")}</span>
                  <span className="text-xs font-mono font-bold text-primary">{formatWjk(totalSats)} WJK</span>
                </div>
              </div>
            </div>
          )}

          {totalSats > balanceTotal && amountSats > 0 && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
              <p className="text-xs text-destructive">{t("send.insufficient")}</p>
            </div>
          )}

          {/* OP_RETURN */}
          <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium text-muted-foreground">
                {t("send.op_return_toggle")}
              </Label>
              <Switch
                checked={opReturnEnabled}
                onCheckedChange={setOpReturnEnabled}
              />
            </div>
            {opReturnEnabled && (
              <div className="flex flex-col gap-1">
                <Label className="text-xs font-medium text-muted-foreground">
                  {t("send.op_return_data_label")}
                </Label>
                <Textarea
                  rows={2}
                  maxLength={80}
                  placeholder={t("send.op_return_placeholder")}
                  value={opReturnMessage}
                  onChange={(e) => setOpReturnMessage(e.target.value)}
                  className="resize-none font-mono text-sm"
                />
                <span className="text-right text-xs text-muted-foreground">
                  {opReturnMessage.length}/80
                </span>
              </div>
            )}
          </div>

          <Button
            className="w-full gap-2"
            disabled={!isValid}
            onClick={() => setStep("confirm")}
          >
            <Send className="h-4 w-4" />
            {t("send.review_tx")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
