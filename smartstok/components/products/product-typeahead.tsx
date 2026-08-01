"use client";

import { useDeferredValue, useEffect, useState } from "react";
import {
  searchProductsAction,
  type ProductSearchHit,
} from "@/lib/actions/products";
import { searchProductCatalogAction } from "@/lib/actions/catalog";
import type { BarcodeParseResult } from "@/lib/utils/barcode-parser";
import { BarcodeInput } from "@/components/ui/barcode-input";
import { cn } from "@/lib/utils";

export function ProductTypeahead({
  locationId,
  mode = "stock",
  onSelect,
  onParsed,
  placeholder = "Referans, ürün adı veya barkod…",
  selectedLabel,
  disabled = false,
}: {
  locationId?: string;
  /** stock: stoklu ürünler | catalog: tüm ürün tanımları */
  mode?: "stock" | "catalog";
  onSelect: (product: ProductSearchHit) => void;
  /** GS1 karekod ayrıştırıldığında (Mal Kabul’de lot/SKT doldurmak için) */
  onParsed?: (parsed: BarcodeParseResult) => void;
  placeholder?: string;
  selectedLabel?: string | null;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState(selectedLabel ?? "");
  const deferredQuery = useDeferredValue(query);
  const [results, setResults] = useState<ProductSearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // undefined = kontrol edilmiyor; null = bilinçli temizleme
    if (selectedLabel === undefined) return;
    setQuery(selectedLabel ?? "");
    if (!selectedLabel) {
      setResults([]);
      setOpen(false);
    }
  }, [selectedLabel]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (disabled || deferredQuery.trim().length < 2) {
        setResults([]);
        return;
      }

      if (mode === "stock" && !locationId) {
        setResults([]);
        return;
      }

      setLoading(true);
      try {
        const hits =
          mode === "catalog"
            ? await searchProductCatalogAction(deferredQuery)
            : await searchProductsAction(deferredQuery, {
                locationId,
                onlyAvailable: true,
              });

        if (!cancelled) {
          setResults(hits);
          setOpen(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [deferredQuery, locationId, mode, disabled]);

  return (
    <div className="relative">
      <BarcodeInput
        value={query}
        onValueChange={setQuery}
        onParsed={onParsed}
        onEnter={(parsed) => {
          // Enter: aramayı kısa barkodla sürdür / tek sonuç varsa seç
          if (parsed.barkod) setQuery(parsed.barkod);
        }}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder={placeholder}
        disabled={disabled}
      />
      {loading ? (
        <p className="mt-1 text-xs text-blue-400/80">Aranıyor…</p>
      ) : null}

      {open && results.length > 0 ? (
        <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-zinc-700 bg-zinc-950 py-1 shadow-xl shadow-blue-950/30">
          {results.map((item) => (
            <li key={item.productId}>
              <button
                type="button"
                className={cn(
                  "w-full px-3 py-2.5 text-left text-sm text-zinc-200 transition-colors hover:bg-blue-600/20 hover:text-blue-200",
                )}
                onClick={() => {
                  onSelect(item);
                  setQuery(
                    mode === "catalog"
                      ? `${item.referenceCode} · ${item.name}`
                      : item.label,
                  );
                  setOpen(false);
                }}
              >
                <span className="block font-medium">
                  {mode === "catalog"
                    ? `${item.referenceCode} · ${item.name}`
                    : item.label}
                </span>
                <span className="text-xs text-zinc-500">
                  {item.brand}
                  {item.barcode ? ` · ${item.barcode}` : ""}
                  {mode === "catalog"
                    ? ` · Stok: ${item.totalCount}`
                    : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {open &&
      !loading &&
      deferredQuery.trim().length >= 2 &&
      results.length === 0 ? (
        <p className="mt-1 text-xs text-zinc-500">Sonuç bulunamadı.</p>
      ) : null}
    </div>
  );
}
