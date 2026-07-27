"use client";

import { useRef, useState, useTransition } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { importProductsAction } from "@/lib/actions/admin";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export function AdminProductImport() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setMessage({ type: "err", text: "Dosya seçin." });
      return;
    }

    const fd = new FormData();
    fd.set("file", file);
    setMessage(null);

    startTransition(async () => {
      const result = await importProductsAction(fd);
      if (result.error) {
        setMessage({ type: "err", text: result.error });
        return;
      }
      setMessage({
        type: "ok",
        text: result.message ?? "İçe aktarım tamamlandı.",
      });
      if (inputRef.current) inputRef.current.value = "";
      setFileName(null);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="product-file">Excel / CSV</Label>
        <input
          id="product-file"
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          disabled={isPending}
          className="sr-only"
          onChange={(e) => {
            setFileName(e.target.files?.[0]?.name ?? null);
            setMessage(null);
          }}
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button
            type="button"
            disabled={isPending}
            onClick={() => inputRef.current?.click()}
          >
            Dosya Seç
          </Button>
          <span
            className={
              fileName
                ? "truncate text-sm text-zinc-200"
                : "text-sm text-zinc-500"
            }
          >
            {fileName ?? "Dosya seçilmedi"}
          </span>
        </div>
        <p className="text-xs text-zinc-500">
          Başlık satırı gerekli. Desteklenen sütunlar:{" "}
          <span className="text-zinc-400">
            Referans, Ad, Marka, Kategori, Barkod, Çap, Boy, Miktar, Fiyat
          </span>{" "}
          (isteğe bağlı: Alış Fiyatı, Satış Fiyatı). Kategori sütunu Excel’deki
          metin olarak kaydedilir (örn. İmplant, Ara Parça). Referans yoksa
          barkod kullanılır.
        </p>
      </div>

      {message ? (
        <p
          className={
            message.type === "err"
              ? "text-sm text-red-300"
              : "text-sm text-emerald-300"
          }
        >
          {message.text}
        </p>
      ) : null}

      <Button type="submit" disabled={isPending}>
        {isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <FileUp className="size-4" />
        )}
        Ürünleri İçe Aktar
      </Button>
    </form>
  );
}
