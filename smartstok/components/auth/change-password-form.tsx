"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";

export function ChangePasswordForm() {
  const router = useRouter();
  const { update } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form = e.currentTarget;
    const currentPassword = (
      form.elements.namedItem("currentPassword") as HTMLInputElement
    ).value;
    const newPassword = (
      form.elements.namedItem("newPassword") as HTMLInputElement
    ).value;
    const confirmPassword = (
      form.elements.namedItem("confirmPassword") as HTMLInputElement
    ).value;

    startTransition(async () => {
      try {
        const res = await fetch("/api/change-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            currentPassword,
            newPassword,
            confirmPassword,
          }),
        });

        const data = (await res.json().catch(() => null)) as {
          error?: string;
          success?: boolean;
        } | null;

        if (!res.ok || data?.error) {
          setError(data?.error ?? "Şifre güncellenemedi.");
          return;
        }

        setDone(true);

        try {
          await update({ forcePasswordChange: false });
        } catch {
          // JWT güncellenemese bile DB güncellendi
        }

        router.replace("/dashboard");
        router.refresh();
      } catch {
        setError("Bağlantı hatası. Lütfen tekrar deneyin.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="currentPassword">Mevcut şifre</Label>
        <PasswordInput
          id="currentPassword"
          name="currentPassword"
          autoComplete="current-password"
          required
          disabled={isPending || done}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="newPassword">Yeni şifre</Label>
        <PasswordInput
          id="newPassword"
          name="newPassword"
          autoComplete="new-password"
          minLength={8}
          required
          disabled={isPending || done}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Yeni şifre (tekrar)</Label>
        <PasswordInput
          id="confirmPassword"
          name="confirmPassword"
          autoComplete="new-password"
          minLength={8}
          required
          disabled={isPending || done}
        />
      </div>

      {error ? (
        <p
          className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {done ? (
        <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
          Şifre güncellendi, yönlendiriliyorsunuz…
        </p>
      ) : null}

      <Button
        type="submit"
        className="w-full"
        size="lg"
        disabled={isPending || done}
      >
        {isPending || done ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            {done ? "Yönlendiriliyor…" : "Kaydediliyor…"}
          </>
        ) : (
          "Şifreyi Güncelle"
        )}
      </Button>
    </form>
  );
}
