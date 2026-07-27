"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import {
  executeConsignmentTransferAction,
  type TransferPageData,
} from "@/lib/actions/transfers";
import {
  getProductLotsAction,
  type LotAvailability,
  type ProductSearchHit,
} from "@/lib/actions/products";
import { ProductTypeahead } from "@/components/products/product-typeahead";
import { formatRoles } from "@/lib/roles";
import type { UserRole } from "@/types/next-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

type FormData = Pick<TransferPageData, "locations" | "fieldUsers">;

export function TransferForm({ data }: { data: FormData }) {
  const mainDepot = data.locations.find((l) => l.type === "MAIN_DEPOT");
  const [fromLocationId, setFromLocationId] = useState(mainDepot?.id ?? "");
  const [toLocationId, setToLocationId] = useState("");
  const [requestedById, setRequestedById] = useState(
    data.fieldUsers[0]?.id ?? "",
  );
  const [product, setProduct] = useState<ProductSearchHit | null>(null);
  const [productKey, setProductKey] = useState(0);
  const [lots, setLots] = useState<LotAvailability[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [loadingLots, setLoadingLots] = useState(false);

  const toOptions = data.locations.filter((l) => l.id !== fromLocationId);
  const fromLabel =
    data.locations.find((l) => l.id === fromLocationId)?.label ?? "kaynak";

  useEffect(() => {
    setProduct(null);
    setLots([]);
    setQuantities({});
    setProductKey((k) => k + 1);
    setToLocationId((prev) => (prev === fromLocationId ? "" : prev));
  }, [fromLocationId]);

  useEffect(() => {
    let cancelled = false;

    async function loadLots() {
      if (!product || !fromLocationId) {
        setLots([]);
        setQuantities({});
        return;
      }

      setLoadingLots(true);
      try {
        const result = await getProductLotsAction(
          product.productId,
          fromLocationId,
        );
        if (!cancelled) {
          setLots(result);
          setQuantities({});
        }
      } finally {
        if (!cancelled) setLoadingLots(false);
      }
    }

    void loadLots();

    return () => {
      cancelled = true;
    };
  }, [product, fromLocationId]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!product) {
      setError("Ürün seçin.");
      return;
    }

    const lotSelections = Object.entries(quantities)
      .filter(([, qty]) => qty > 0)
      .map(([lotNumber, quantity]) => ({ lotNumber, quantity }));

    if (lotSelections.length === 0) {
      setError("En az bir lot için adet girin.");
      return;
    }

    startTransition(async () => {
      const result = await executeConsignmentTransferAction({
        fromLocationId,
        toLocationId,
        requestedById,
        productId: product.productId,
        lotSelections,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      setSuccess(`${result.transferredCount} adet transfer edildi.`);
      setProduct(null);
      setLots([]);
      setQuantities({});
      setProductKey((k) => k + 1);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="from">Nereden (Kaynak Depo)</Label>
          <Select
            id="from"
            value={fromLocationId}
            onChange={(e) => setFromLocationId(e.target.value)}
            required
          >
            <option value="">Seçin…</option>
            {data.locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="to">Nereye (Hedef Depo)</Label>
          <Select
            id="to"
            value={toLocationId}
            onChange={(e) => setToLocationId(e.target.value)}
            required
            disabled={!fromLocationId}
          >
            <option value="">Seçin…</option>
            {toOptions.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="requester">Talep Eden Saha Elemanı</Label>
          <Select
            id="requester"
            value={requestedById}
            onChange={(e) => setRequestedById(e.target.value)}
            required
          >
            <option value="">Seçin…</option>
            {data.fieldUsers.map((user) => (
              <option key={user.id} value={user.id}>
                {user.fullName} ({formatRoles(user.roles as UserRole[])})
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label>Ürün Ara (kaynak depodaki stok)</Label>
          <ProductTypeahead
            key={productKey}
            locationId={fromLocationId || undefined}
            mode="stock"
            disabled={!fromLocationId}
            onSelect={setProduct}
            placeholder={
              fromLocationId
                ? `${fromLabel} içinden ürün ara…`
                : "Önce kaynak depo seçin…"
            }
          />
          {product ? (
            <p className="text-xs text-blue-300">Seçili: {product.label}</p>
          ) : null}
        </div>
      </div>

      {loadingLots ? (
        <p className="text-sm text-zinc-500">Lotlar yükleniyor…</p>
      ) : null}

      {product && lots.length > 0 ? (
        <div className="space-y-3">
          <Label>Hangi lot numaralarından düşülsün?</Label>
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full min-w-[420px] text-sm">
              <thead className="bg-zinc-900/80 text-zinc-400">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Lot No</th>
                  <th className="px-4 py-3 text-left font-medium">Müsait</th>
                  <th className="px-4 py-3 text-left font-medium">
                    Transfer Adedi
                  </th>
                </tr>
              </thead>
              <tbody>
                {lots.map((lot) => (
                  <tr key={lot.lotNumber} className="border-t border-zinc-800">
                    <td className="px-4 py-3 font-mono text-blue-300">
                      {lot.lotNumber}
                    </td>
                    <td className="px-4 py-3 text-zinc-300">{lot.count}</td>
                    <td className="px-4 py-3">
                      <Input
                        type="number"
                        min={0}
                        max={lot.count}
                        className="h-9 w-24"
                        value={quantities[lot.lotNumber] ?? 0}
                        onChange={(e) => {
                          const value = Math.min(
                            lot.count,
                            Math.max(0, Number(e.target.value) || 0),
                          );
                          setQuantities((prev) => ({
                            ...prev,
                            [lot.lotNumber]: value,
                          }));
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {product && !loadingLots && lots.length === 0 ? (
        <p className="text-sm text-amber-300/90">
          Seçili kaynak depoda bu ürün için müsait lot yok.
        </p>
      ) : null}

      {error ? (
        <p
          className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {success ? (
        <p className="rounded-md border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm text-blue-300">
          {success}
        </p>
      ) : null}

      <Button
        type="submit"
        size="lg"
        disabled={
          isPending ||
          !fromLocationId ||
          !toLocationId ||
          !requestedById ||
          !product ||
          lots.length === 0
        }
      >
        {isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Transfer ediliyor…
          </>
        ) : (
          "Transferi Onayla"
        )}
      </Button>
    </form>
  );
}
