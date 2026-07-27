"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserPlus } from "lucide-react";
import { createStaffUserAction } from "@/lib/actions/admin";
import { ROLE_LABELS, STAFF_ROLE_OPTIONS } from "@/lib/roles";
import type { UserRole } from "@/types/next-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AdminCreateUserForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [roles, setRoles] = useState<UserRole[]>(["DEPO"]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [message, setMessage] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleStaffRole(role: UserRole) {
    setRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    const selected: UserRole[] = [
      ...(isAdmin ? (["ADMIN"] as UserRole[]) : []),
      ...roles.filter((r) => r !== "ADMIN"),
    ];

    if (selected.length === 0) {
      setMessage({ type: "err", text: "En az bir yetki seçin." });
      return;
    }

    startTransition(async () => {
      const result = await createStaffUserAction({
        email,
        fullName,
        password,
        roles: selected,
      });
      if (result.error) {
        setMessage({ type: "err", text: result.error });
        return;
      }
      setMessage({
        type: "ok",
        text: "Kullanıcı oluşturuldu. İlk girişte şifre değiştirmesi istenecek.",
      });
      setEmail("");
      setFullName("");
      setPassword("");
      setRoles(["DEPO"]);
      setIsAdmin(false);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="admin-name">Ad Soyad</Label>
          <Input
            id="admin-name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            disabled={isPending}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="admin-email">E-posta</Label>
          <Input
            id="admin-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={isPending}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="admin-pass">Şifre</Label>
          <Input
            id="admin-pass"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
            disabled={isPending}
          />
        </div>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-zinc-300">Yetkiler</legend>
        <p className="text-xs text-zinc-500">
          Bir kullanıcıya birden fazla yetki verebilirsiniz. Gözlemci yalnızca
          okuma yetkisi verir (Admin paneli hariç tüm sayfalar).
        </p>
        <div className="flex flex-wrap gap-3">
          {STAFF_ROLE_OPTIONS.map((opt) => {
            const checked = roles.includes(opt.value);
            return (
              <label
                key={opt.value}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  checked
                    ? "border-blue-500/50 bg-blue-500/10 text-blue-200"
                    : "border-zinc-700 bg-zinc-900/50 text-zinc-400 hover:border-zinc-600"
                }`}
              >
                <input
                  type="checkbox"
                  className="size-4 accent-blue-500"
                  checked={checked}
                  disabled={isPending}
                  onChange={() => toggleStaffRole(opt.value)}
                />
                {opt.label}
              </label>
            );
          })}
          <label
            className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
              isAdmin
                ? "border-amber-500/50 bg-amber-500/10 text-amber-200"
                : "border-zinc-700 bg-zinc-900/50 text-zinc-400 hover:border-zinc-600"
            }`}
          >
            <input
              type="checkbox"
              className="size-4 accent-amber-500"
              checked={isAdmin}
              disabled={isPending}
              onChange={(e) => setIsAdmin(e.target.checked)}
            />
            {ROLE_LABELS.ADMIN}
          </label>
        </div>
      </fieldset>

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
          <UserPlus className="size-4" />
        )}
        Personel Ekle
      </Button>
    </form>
  );
}
