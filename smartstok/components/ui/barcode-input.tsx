"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import {
  looksLikeGs1Payload,
  parseBarcode,
  type BarcodeParseResult,
} from "@/lib/utils/barcode-parser";

/**
 * Fiziksel okuyucu karakter aralığı (ms).
 * Birçok tabanca 5–40ms; yavaş wedge’ler ~80–100ms olabilir.
 */
const SCAN_GAP_MS = 120;

/** Burst bittikten sonra parse (Enter yoksa). Tarama ortasında kesilmemeli. */
const SCAN_IDLE_MS = 450;

type BarcodeInputProps = Omit<
  React.ComponentProps<"input">,
  "value" | "onChange" | "onKeyDown" | "onPaste"
> & {
  value: string;
  onValueChange: (value: string) => void;
  onParsed?: (parsed: BarcodeParseResult) => void;
  onEnter?: (parsed: BarcodeParseResult) => void;
};

/**
 * Barkod / karekod alanı.
 * Okuyucu ham GS1’i input’a yazdırmaz; buffer’da tutup EAN’a çevirir.
 */
export const BarcodeInput = React.forwardRef<HTMLInputElement, BarcodeInputProps>(
  function BarcodeInput(
    { value, onValueChange, onParsed, onEnter, ...props },
    ref,
  ) {
    const bufferRef = React.useRef("");
    const lastKeyAtRef = React.useRef(0);
    const scanningRef = React.useRef(false);
    const idleTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
      null,
    );
    const valueRef = React.useRef(value);
    valueRef.current = value;

    function clearIdleTimer() {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
    }

    function applyParsed(parsed: BarcodeParseResult) {
      onValueChange(parsed.barkod);
      onParsed?.(parsed);
    }

    /** Ekranda asla ham GS1 gösterme */
    function syncDisplayFromBuffer() {
      const buf = bufferRef.current;
      if (!buf) return;
      const live = parseBarcode(buf);
      if (live.type === "QR" && live.barkod) {
        onValueChange(live.barkod);
        return;
      }
      if (looksLikeGs1Payload(buf) || buf.length > 14) {
        // Henüz tam parse yok ama uzun/GS1 — hamı gizle
        onValueChange(live.barkod && live.barkod.length <= 14 ? live.barkod : "");
      }
    }

    function finalizeBuffer(triggerEnter: boolean) {
      clearIdleTimer();
      const raw = bufferRef.current || valueRef.current;
      bufferRef.current = "";
      scanningRef.current = false;
      if (!raw.trim()) {
        if (triggerEnter) onEnter?.(parseBarcode(""));
        return;
      }
      const parsed = parseBarcode(raw);
      applyParsed(parsed);
      if (triggerEnter) onEnter?.(parsed);
    }

    function scheduleIdleFinalize() {
      clearIdleTimer();
      idleTimerRef.current = setTimeout(() => {
        if (bufferRef.current) {
          finalizeBuffer(false);
        } else {
          scanningRef.current = false;
        }
      }, SCAN_IDLE_MS);
    }

    function appendScanChar(char: string) {
      scanningRef.current = true;
      bufferRef.current += char;
      syncDisplayFromBuffer();
      scheduleIdleFinalize();
    }

    function beginOrContinueScan(char: string, gap: number) {
      // Burst’ün 2. karakteri: ilk karakter value’ya sızmış olabilir
      if (
        bufferRef.current.length === 0 &&
        gap < SCAN_GAP_MS &&
        valueRef.current.length > 0 &&
        valueRef.current.length <= 3 &&
        !looksLikeGs1Payload(valueRef.current)
      ) {
        bufferRef.current = valueRef.current;
        onValueChange("");
      }
      appendScanChar(char);
    }

    React.useEffect(() => () => clearIdleTimer(), []);

    return (
      <Input
        {...props}
        ref={ref}
        value={value}
        autoComplete="off"
        spellCheck={false}
        onPaste={(e) => {
          const text = e.clipboardData.getData("text") ?? "";
          if (!text.trim()) return;
          e.preventDefault();
          bufferRef.current = "";
          scanningRef.current = false;
          clearIdleTimer();
          applyParsed(parseBarcode(text));
        }}
        onChange={(e) => {
          const raw = e.target.value;

          // Güvenlik ağı: ham GS1 / uzun payload bir şekilde sızdıysa ez
          if (
            looksLikeGs1Payload(raw) ||
            (raw.length > 14 && /01\d{13,}/.test(raw.replace(/\s/g, "")))
          ) {
            bufferRef.current = "";
            scanningRef.current = false;
            clearIdleTimer();
            applyParsed(parseBarcode(raw));
            return;
          }

          // Uzun metin ama henüz looksLike değil — yine parse dene
          if (raw.length > 20) {
            const parsed = parseBarcode(raw);
            if (parsed.type === "QR" && parsed.barkod) {
              bufferRef.current = "";
              scanningRef.current = false;
              clearIdleTimer();
              applyParsed(parsed);
              return;
            }
          }

          // Tarama buffer’ı aktifken onChange’i yok say (React controlled yarışı)
          if (scanningRef.current || bufferRef.current.length > 0) {
            return;
          }

          onValueChange(raw);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            finalizeBuffer(true);
            return;
          }

          if (e.key === "Escape") {
            bufferRef.current = "";
            scanningRef.current = false;
            clearIdleTimer();
            onValueChange("");
            return;
          }

          if (e.key === "Backspace" || e.key === "Delete") {
            if (scanningRef.current || bufferRef.current.length > 0) {
              e.preventDefault();
              bufferRef.current = "";
              scanningRef.current = false;
              clearIdleTimer();
              onValueChange("");
            }
            return;
          }

          if (
            e.key.length !== 1 ||
            e.ctrlKey ||
            e.metaKey ||
            e.altKey
          ) {
            return;
          }

          const now = Date.now();
          const gap = now - lastKeyAtRef.current;
          lastKeyAtRef.current = now;

          const inBurst =
            scanningRef.current ||
            bufferRef.current.length > 0 ||
            gap < SCAN_GAP_MS;

          // GS1 neredeyse her zaman '0' ile başlar — boş alandan itibaren yakala
          const gs1Start =
            !scanningRef.current &&
            bufferRef.current.length === 0 &&
            valueRef.current === "" &&
            e.key === "0";

          if (inBurst || gs1Start) {
            e.preventDefault();
            e.stopPropagation();
            beginOrContinueScan(e.key, gap);
            return;
          }

          // Yavaş manuel yazım — tarama değil; ilk karakteri de buffer’a alma
          // (bir sonraki hızlı char gelirse inBurst value’dan geri toplar)
        }}
      />
    );
  },
);
