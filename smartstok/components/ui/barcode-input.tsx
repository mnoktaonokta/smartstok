"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import {
  looksLikeGs1Payload,
  parseBarcode,
  type BarcodeParseResult,
} from "@/lib/utils/barcode-parser";

/** Karakterler arası bu süreden kısaysa fiziksel okuyucu kabul edilir */
const SCAN_GAP_MS = 55;

type BarcodeInputProps = Omit<
  React.ComponentProps<"input">,
  "value" | "onChange" | "onKeyDown" | "onPaste"
> & {
  value: string;
  /** Input’ta gösterilecek / saklanacak değer (EAN veya manuel metin) */
  onValueChange: (value: string) => void;
  /** GS1 ayrıştırıldığında (lot/SKT vb.) */
  onParsed?: (parsed: BarcodeParseResult) => void;
  /**
   * Enter: okuyucu string sonu.
   * Varsayılan form submit engellenir; parsed sonuç verilir.
   */
  onEnter?: (parsed: BarcodeParseResult) => void;
};

/**
 * Fiziksel barkod okuyucu (klavye wedge) + manuel giriş.
 * Karekod ham string buffer’da tutulur; ekranda yalnızca kısa EAN görünür.
 */
export const BarcodeInput = React.forwardRef<HTMLInputElement, BarcodeInputProps>(
  function BarcodeInput(
    { value, onValueChange, onParsed, onEnter, ...props },
    ref,
  ) {
    const bufferRef = React.useRef("");
    const lastKeyAtRef = React.useRef(0);
    const pendingCharRef = React.useRef<string | null>(null);
    const flushTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
      null,
    );

    function clearFlushTimer() {
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
    }

    function applyParsed(parsed: BarcodeParseResult) {
      onValueChange(parsed.barkod);
      onParsed?.(parsed);
    }

    function showLiveFromBuffer() {
      const live = parseBarcode(bufferRef.current);
      if (live.type === "QR" && live.barkod) {
        onValueChange(live.barkod);
      }
    }

    function flushBuffer() {
      const raw = bufferRef.current;
      if (!raw) return;
      bufferRef.current = "";
      pendingCharRef.current = null;
      clearFlushTimer();
      applyParsed(parseBarcode(raw));
    }

    function scheduleFlush() {
      clearFlushTimer();
      flushTimerRef.current = setTimeout(() => {
        flushBuffer();
      }, 90);
    }

    function beginScanBuffer(chars: string) {
      bufferRef.current = chars;
      pendingCharRef.current = null;
      // İlk karakter zaten value’da göründüyse temizle; GS1’de kısa EAN göster
      showLiveFromBuffer();
      if (!looksLikeGs1Payload(chars) && parseBarcode(chars).type !== "QR") {
        // Henüz EAN/GS1 belli değil — ham metni gösterme
        onValueChange("");
      }
      scheduleFlush();
    }

    React.useEffect(() => () => clearFlushTimer(), []);

    return (
      <Input
        {...props}
        ref={ref}
        value={value}
        autoComplete="off"
        onPaste={(e) => {
          const text = e.clipboardData.getData("text") ?? "";
          if (looksLikeGs1Payload(text) || text.replace(/\s/g, "").length > 14) {
            e.preventDefault();
            bufferRef.current = "";
            pendingCharRef.current = null;
            clearFlushTimer();
            applyParsed(parseBarcode(text));
          }
        }}
        onChange={(e) => {
          const raw = e.target.value;
          if (looksLikeGs1Payload(raw)) {
            bufferRef.current = "";
            pendingCharRef.current = null;
            clearFlushTimer();
            applyParsed(parseBarcode(raw));
            return;
          }
          // Manuel yavaş yazım (okuyucu buffer’ı yok)
          if (bufferRef.current.length === 0) {
            pendingCharRef.current = null;
            clearFlushTimer();
            onValueChange(raw);
          }
        }}
        onKeyDown={(e) => {
          const now = Date.now();
          const gap = now - lastKeyAtRef.current;
          lastKeyAtRef.current = now;

          if (e.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            clearFlushTimer();
            const raw = bufferRef.current || value;
            bufferRef.current = "";
            pendingCharRef.current = null;
            const parsed = parseBarcode(raw);
            applyParsed(parsed);
            onEnter?.(parsed);
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

          // Aktif okuyucu buffer’ı
          if (bufferRef.current.length > 0) {
            e.preventDefault();
            bufferRef.current += e.key;
            showLiveFromBuffer();
            scheduleFlush();
            return;
          }

          // İkinci (ve sonraki) hızlı karakter → tarama başladı
          if (pendingCharRef.current !== null && gap < SCAN_GAP_MS) {
            e.preventDefault();
            beginScanBuffer(pendingCharRef.current + e.key);
            return;
          }

          // Boş alanda GS1’in tipik ilk karakteri (0) — hemen buffer’a al
          if (value === "" && e.key === "0") {
            e.preventDefault();
            beginScanBuffer(e.key);
            return;
          }

          // İlk / yavaş karakter: onChange’e bırak, hızlı devam için işaretle
          pendingCharRef.current = e.key;
        }}
      />
    );
  },
);
