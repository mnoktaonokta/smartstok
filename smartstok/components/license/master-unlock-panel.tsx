"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, KeyRound, Loader2, Shield } from "lucide-react";
import {
  extendLicenseAction,
  verifyMasterSecretAction,
} from "@/lib/actions/master-license";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function MasterUnlockPanel() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const result = await verifyMasterSecretAction(password);
      if (result.error) {
        setUnlocked(false);
        setError(result.error);
        return;
      }
      setUnlocked(true);
      setInfo("Doğrulandı. Lisans uzatma seçenekleri açık.");
    });
  }

  function handleExtend(months: 1 | 12) {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const result = await extendLicenseAction({ password, months });
      if (result.error) {
        setError(result.error);
        return;
      }
      const label = months === 12 ? "1 yıl" : "1 ay";
      const end = result.licenseEndDate
        ? new Date(result.licenseEndDate).toLocaleDateString("tr-TR")
        : "";
      setInfo(`Lisans ${label} uzatıldı. Bitiş: ${end}`);
      router.replace("/dashboard");
      router.refresh();
    });
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(37,99,235,0.2),_transparent_55%)]" />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950/90 p-6 shadow-xl sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-blue-600/20 text-blue-300">
            <Shield className="size-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">Master Unlock</h1>
            <p className="text-xs text-zinc-500">Gizli lisans yönetim paneli</p>
          </div>
        </div>

        {!unlocked ? (
          <form onSubmit={handleVerify} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="master-secret">Master Şifre</Label>
              <Input
                id="master-secret"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="off"
                disabled={isPending}
                placeholder="MASTER_SECRET"
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={isPending || !password.trim()}
            >
              {isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <KeyRound className="size-4" />
              )}
              Doğrula
            </Button>
          </form>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-zinc-400">
              Lisans bitiş tarihine süre eklenir (süresi dolmuşsa bugünden
              itibaren).
            </p>
            <Button
              type="button"
              className="w-full"
              disabled={isPending}
              onClick={() => handleExtend(12)}
            >
              {isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CalendarPlus className="size-4" />
              )}
              Lisansı 1 Yıl Uzat
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={isPending}
              onClick={() => handleExtend(1)}
            >
              Lisansı 1 Ay Uzat
            </Button>
          </div>
        )}

        {error ? (
          <p className="mt-4 text-sm text-red-300" role="alert">
            {error}
          </p>
        ) : null}
        {info ? (
          <p className="mt-4 text-sm text-emerald-300">{info}</p>
        ) : null}
      </div>
    </main>
  );
}
