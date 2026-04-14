"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import jsQR from "jsqr";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { QrCode, Upload, Loader2 } from "lucide-react";
import { decodeQrFromImageFile } from "@/lib/decode-qr-from-image";
import { parseWojakCoinQr } from "@/lib/parse-bip21";

export function canUseCamera(): boolean {
  if (typeof navigator === "undefined" || typeof window === "undefined") return false;
  // Camera APIs require secure context (HTTPS, localhost).
  if (!window.isSecureContext) return false;
  return !!navigator.mediaDevices?.getUserMedia;
}

/** Legacy helper kept for compatibility. */
/** Keeps WebView/Android from OOM-crashing on full 4K camera frames during jsQR decode. */
const QR_SCAN_VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 1280, max: 1920 },
  height: { ideal: 720, max: 1080 },
  frameRate: { ideal: 15, max: 30 },
};

export async function getCameraStreamForScanner(): Promise<MediaStream | null> {
  if (!canUseCamera()) return null;
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { ...QR_SCAN_VIDEO_CONSTRAINTS, facingMode: { ideal: "environment" } },
      audio: false,
    });
  } catch {
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: { ...QR_SCAN_VIDEO_CONSTRAINTS, facingMode: { ideal: "user" } },
        audio: false,
      });
    } catch {
      try {
        return await navigator.mediaDevices.getUserMedia({
          video: { ...QR_SCAN_VIDEO_CONSTRAINTS },
          audio: false,
        });
      } catch {
        return null;
      }
    }
  }
}

interface QrScannerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScan: (text: string) => void;
  onError?: (err: unknown) => void;
  stream?: MediaStream | null;
  title?: string;
  description?: string;
}

export function QrScannerModal({
  open,
  onOpenChange,
  onScan,
  onError,
  stream: _externalStream,
  title = "Scan QR Code",
  description = "Point your camera at a QR code or upload an image",
}: QrScannerModalProps) {
  const hasScanned = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [imageError, setImageError] = useState("");
  const [decoding, setDecoding] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [isStartingCamera, setIsStartingCamera] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");

  const useCamera = canUseCamera();

  const stopCamera = useCallback(() => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setImageError("");
    setCameraError("");
    setFacingMode("environment");
    hasScanned.current = false;
  }, [open]);

  const handleDecodeResult = useCallback((result: { getText: () => string }) => {
    if (hasScanned.current) return;
    const text = result.getText();
    const parsed = parseWojakCoinQr(text);
    if (!parsed) {
      setImageError("Invalid QR: not a WojakCoin address");
      return;
    }
    hasScanned.current = true;
    onScan(text);
    onOpenChange(false);
    setTimeout(() => {
      hasScanned.current = false;
    }, 500);
  }, [onOpenChange, onScan]);

  const scanVideoFrame = useCallback(() => {
    if (!open || hasScanned.current) return;
    const video = videoRef.current;
    if (!video || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
      rafRef.current = window.requestAnimationFrame(scanVideoFrame);
      return;
    }

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    // Decode at reduced size — full-res buffers per frame OOM WebView on many Android devices.
    const MAX_EDGE = 720;
    const scale = Math.min(1, MAX_EDGE / Math.max(vw, vh));
    const tw = Math.max(1, Math.floor(vw * scale));
    const th = Math.max(1, Math.floor(vh * scale));

    let canvas = canvasRef.current;
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvasRef.current = canvas;
    }
    if (canvas.width !== tw || canvas.height !== th) {
      canvas.width = tw;
      canvas.height = th;
    }
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      rafRef.current = window.requestAnimationFrame(scanVideoFrame);
      return;
    }

    ctx.drawImage(video, 0, 0, tw, th);
    const image = ctx.getImageData(0, 0, tw, th);
    const decoded = jsQR(image.data, image.width, image.height, {
      inversionAttempts: "attemptBoth",
    });
    if (decoded?.data) {
      handleDecodeResult({ getText: () => decoded.data });
      return;
    }

    rafRef.current = window.requestAnimationFrame(scanVideoFrame);
  }, [handleDecodeResult, open]);

  const startCamera = useCallback(async () => {
    if (!open || !useCamera) return;
    setCameraError("");
    setIsStartingCamera(true);
    stopCamera();

    let stream: MediaStream | null = null;
    let lastErr: unknown = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { ...QR_SCAN_VIDEO_CONSTRAINTS, facingMode: { ideal: facingMode } },
        audio: false,
      });
    } catch (err) {
      lastErr = err;
    }

    if (!stream && facingMode === "environment") {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { ...QR_SCAN_VIDEO_CONSTRAINTS, facingMode: { ideal: "user" } },
          audio: false,
        });
      } catch (err) {
        lastErr = err;
      }
    }

    if (!stream) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { ...QR_SCAN_VIDEO_CONSTRAINTS },
          audio: false,
        });
      } catch (err) {
        lastErr = err;
      }
    }

    if (!stream) {
      setCameraError(
        lastErr instanceof Error && lastErr.message
          ? lastErr.message
          : "Unable to access camera"
      );
      onError?.(lastErr);
      setIsStartingCamera(false);
      return;
    }

    streamRef.current = stream;
    const video = videoRef.current;
    if (!video) {
      setIsStartingCamera(false);
      return;
    }
    video.srcObject = stream;
    try {
      await video.play();
    } catch (err) {
      onError?.(err);
    }
    setIsStartingCamera(false);
    rafRef.current = window.requestAnimationFrame(scanVideoFrame);
  }, [open, useCamera, facingMode, onError, scanVideoFrame, stopCamera]);

  useEffect(() => {
    if (!open || !useCamera) {
      stopCamera();
      return;
    }
    void startCamera();
    return () => stopCamera();
  }, [open, useCamera, facingMode, startCamera, stopCamera]);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImageError("");
    setDecoding(true);
    try {
      const text = await decodeQrFromImageFile(file);
      if (!text) {
        setImageError("No QR code found in image");
        return;
      }
      const parsed = parseWojakCoinQr(text);
      if (!parsed) {
        setImageError("Invalid QR: not a WojakCoin address");
        return;
      }
      onScan(text);
      onOpenChange(false);
    } catch (err) {
      setImageError(err instanceof Error ? err.message : "Failed to decode image");
      onError?.(err);
    } finally {
      setDecoding(false);
    }
  }

  const showCamera = useCamera && open && !cameraError;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileChange}
          disabled={decoding}
        />
        {showCamera ? (
          <>
            <div
              className="relative aspect-square max-h-[min(70vh,400px)] overflow-hidden rounded-lg bg-black"
              style={{ minHeight: 200 }}
            >
              <video
                ref={videoRef}
                className="h-full w-full object-cover"
                style={{ objectFit: "cover" }}
                autoPlay
                muted
                playsInline
              />
              {isStartingCamera && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <Loader2 className="h-6 w-6 animate-spin text-white" />
                </div>
              )}
            </div>
            <div className="flex flex-col items-center gap-2">
              <p className="text-xs text-muted-foreground">
                Position the QR code in frame — it will scan automatically
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={decoding}
                >
                  {decoding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {decoding ? "Decoding..." : "Upload image"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setCameraError("");
                    setFacingMode((m) => (m === "environment" ? "user" : "environment"));
                  }}
                >
                  Switch camera
                </Button>
              </div>
              {imageError && <p className="text-sm text-destructive">{imageError}</p>}
            </div>
          </>
        ) : useCamera ? (
          <div className="flex flex-col items-center gap-4 py-6">
            <p className="text-center text-sm text-muted-foreground">
              {cameraError
                ? "Could not access camera. You can upload a QR image instead."
                : "Open the scanner and point at a QR code."}
            </p>
            {cameraError && (
              <p className="text-center text-xs text-destructive break-all">{cameraError}</p>
            )}
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={decoding}
              className="gap-2"
            >
              {decoding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {decoding ? "Decoding..." : "Or upload image"}
            </Button>
            {imageError && <p className="text-center text-sm text-destructive">{imageError}</p>}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 py-6">
            <p className="text-center text-sm text-muted-foreground">
              Camera not available. Choose an image of a QR code instead.
            </p>
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={decoding}
              className="gap-2"
            >
              {decoding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {decoding ? "Decoding..." : "Choose image / Take photo"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              On mobile, tap to take a photo. On PC, select an image file.
            </p>
            {imageError && <p className="text-center text-sm text-destructive">{imageError}</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
