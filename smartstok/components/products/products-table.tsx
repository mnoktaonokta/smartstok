"use client";

import { useMemo, useState } from "react";
import type { ProductListItem } from "@/lib/actions/catalog";
import { categoryLabel, CATEGORY_OPTIONS } from "@/lib/categories";
import { formatProductSize } from "@/lib/product-format";
import { AddProductDialog } from "@/components/products/add-product-dialog";
import { ProductRowActions } from "@/components/products/product-row-actions";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

export function ProductsTable({
  products,
  brands,
  showPurchasePrice,
  showSalePrice,
  canMutate = true,
}: {
  products: ProductListItem[];
  brands: string[];
  showPurchasePrice: boolean;
  showSalePrice: boolean;
  canMutate?: boolean;
}) {
  const [category, setCategory] = useState("");
  const [brand, setBrand] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (!showInactive && !p.isActive) return false;
      if (category && p.category !== category) return false;
      if (
        brand &&
        p.brand.toLocaleLowerCase("tr-TR") !== brand.toLocaleLowerCase("tr-TR")
      ) {
        return false;
      }
      return true;
    });
  }, [products, category, brand, showInactive]);

  const columns: DataTableColumn<ProductListItem>[] = [
    {
      id: "ref",
      header: "Referans",
      searchableText: (r) => r.referenceCode,
      cell: (r) => (
        <span
          className={
            r.isActive
              ? "font-mono text-blue-300"
              : "font-mono text-zinc-500 line-through"
          }
        >
          {r.referenceCode}
        </span>
      ),
    },
    {
      id: "name",
      header: "Ürün",
      searchableText: (r) => `${r.name} ${r.brand}`,
      cell: (r) => (
        <div>
          <p
            className={
              r.isActive ? "font-medium text-white" : "font-medium text-zinc-500"
            }
          >
            {r.name}
            {!r.isActive ? (
              <span className="ml-2 rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] tracking-wide text-zinc-500 uppercase">
                Pasif
              </span>
            ) : null}
          </p>
          <p className="text-xs text-zinc-500">{r.brand}</p>
        </div>
      ),
    },
    {
      id: "category",
      header: "Kategori",
      searchableText: (r) => categoryLabel(r.category),
      cell: (r) => categoryLabel(r.category),
    },
    {
      id: "size",
      header: "Ölçü",
      searchableText: (r) => formatProductSize(r.diameter, r.length) ?? "",
      cell: (r) => formatProductSize(r.diameter, r.length) ?? "—",
    },
    {
      id: "barcode",
      header: "Barkod",
      searchableText: (r) => r.barcode ?? "",
      cell: (r) => (
        <span className="font-mono text-xs text-zinc-400">
          {r.barcode ?? "—"}
        </span>
      ),
    },
    {
      id: "sale",
      header: "Satış",
      cell: (r) => (
        <span className="tabular-nums">
          {Number(r.salePrice).toLocaleString("tr-TR")} ₺
        </span>
      ),
    },
    ...(showPurchasePrice
      ? [
          {
            id: "purchase",
            header: "Alış",
            cell: (r: ProductListItem) => (
              <span className="tabular-nums text-zinc-400">
                {r.purchasePrice
                  ? `${Number(r.purchasePrice).toLocaleString("tr-TR")} ₺`
                  : "—"}
              </span>
            ),
          } satisfies DataTableColumn<ProductListItem>,
        ]
      : []),
    {
      id: "stock",
      header: "Stok",
      className: "text-right",
      cell: (r) => (
        <span className="font-mono text-blue-300">{r.stockCount}</span>
      ),
    },
    {
      id: "actions",
      header: "İşlemler",
      className: "w-14 text-right",
      cell: (r) => (
        <ProductRowActions
          product={r}
          showPurchasePrice={showPurchasePrice}
          showSalePrice={showSalePrice}
        />
      ),
    },
  ];

  // Depo: fiyat sütunlarını tamamen çıkar
  const visibleColumns = columns.filter((c) => {
    if (c.id === "sale" && !showSalePrice) return false;
    if (c.id === "purchase" && !showPurchasePrice) return false;
    if (c.id === "actions" && !canMutate) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-950/40 p-4 sm:flex-row sm:items-end">
        <div className="space-y-2 sm:w-48">
          <Label htmlFor="filter-category">Kategori</Label>
          <Select
            id="filter-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">Tümü</option>
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2 sm:w-48">
          <Label htmlFor="filter-brand">Marka</Label>
          <Select
            id="filter-brand"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
          >
            <option value="">Tümü</option>
            {brands.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </Select>
        </div>
        <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm text-zinc-400 select-none">
          <input
            type="checkbox"
            className="size-4 accent-blue-500"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Pasif ürünleri göster
        </label>
        <div className="sm:ml-auto">
          {canMutate ? (
            <AddProductDialog
              showPurchasePrice={showPurchasePrice}
              showSalePrice={showSalePrice}
            />
          ) : null}
        </div>
      </div>

      <DataTable
        data={filtered}
        columns={visibleColumns}
        getRowId={(r) => r.id}
        searchPlaceholder="Referans, ad, marka veya barkod…"
        emptyMessage="Filtreye uygun ürün yok."
      />
    </div>
  );
}
