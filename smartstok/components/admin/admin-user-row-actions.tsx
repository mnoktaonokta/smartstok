"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import {
  deleteUserAction,
  updateUserAction,
} from "@/lib/actions/admin";
import { ROLE_LABELS, STAFF_ROLE_OPTIONS } from "@/lib/roles";
import type { UserRole } from "@/types/next-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type AdminUserRow = {
  id: string;
  email: string;
  fullName: string;
  roles: UserRole[];
  isActive: boolean;
};

export function AdminUserRowActions({
  user,
  currentUserId,
}: {
  user: AdminUserRow;
  currentUserId: string;
}) {
  const router = useRouter();
  const isSelf = user.id === currentUserId;
  const [open, setOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [fullName, setFullName] = useState(user.fullName);
  const [email, setEmail] = useState(user.email);
  const [newPassword, setNewPassword] = useState("");
  const [roles, setRoles] = useState<UserRole[]>(
    user.roles.filter((r) => r !== "ADMIN"),
  );
  const [isAdmin, setIsAdmin] = useState(user.roles.includes("ADMIN"));

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  function openEdit() {
    setFullName(user.fullName);
    setEmail(user.email);
    setNewPassword("");
    setRoles(user.roles.filter((r) => r !== "ADMIN"));
    setIsAdmin(user.roles.includes("ADMIN"));
    setError(null);
    setOpen(true);
  }

  function toggleStaffRole(role: UserRole) {
    setRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  }

  function selectedRoles(): UserRole[] {
    return [
      ...(isAdmin ? (["ADMIN"] as UserRole[]) : []),
      ...roles.filter((r) => r !== "ADMIN"),
    ];
  }

  function handleSave() {
    setError(null);
    const selected = selectedRoles();

    if (selected.length === 0) {
      setError("En az bir yetki seçin.");
      return;
    }

    if (isSelf && user.roles.includes("ADMIN") && !selected.includes("ADMIN")) {
      setError(
        "Kendi hesabınızdan Admin yetkisini kaldıramazsınız.",
      );
      return;
    }

    startTransition(async () => {
      const result = await updateUserAction({
        id: user.id,
        fullName,
        email,
        roles: selected,
        newPassword: newPassword.trim() || undefined,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setToast(result.message ?? "Kullanıcı başarıyla güncellendi");
      router.refresh();
    });
  }

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteUserAction(user.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      setDeleteOpen(false);
      setOpen(false);
      setToast(result.message ?? "Kullanıcı silindi.");
      router.refresh();
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={openEdit}
        aria-label="Düzenle"
      >
        <Pencil className="size-4 text-blue-400" />
      </Button>

      {toast ? (
        <div className="fixed right-4 bottom-4 z-50 max-w-sm rounded-lg border border-emerald-500/40 bg-zinc-950 px-4 py-3 text-sm text-emerald-100 shadow-lg">
          {toast}
        </div>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen} className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Kullanıcıyı Düzenle</DialogTitle>
          <DialogDescription>
            Bilgi ve yetkileri güncelleyin. Şifreyi değiştirmek istemiyorsanız
            boş bırakın.
          </DialogDescription>
        </DialogHeader>

        <DialogContent className="max-h-[70vh] space-y-4 overflow-y-auto">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor={`edit-name-${user.id}`}>Ad Soyad</Label>
              <Input
                id={`edit-name-${user.id}`}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                disabled={isPending}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor={`edit-email-${user.id}`}>E-posta</Label>
              <Input
                id={`edit-email-${user.id}`}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isPending}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor={`edit-pass-${user.id}`}>Yeni Şifre</Label>
              <PasswordInput
                id={`edit-pass-${user.id}`}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={8}
                disabled={isPending}
                placeholder="••••••••"
              />
              <p className="text-xs text-zinc-500">
                Değiştirmek istemiyorsanız boş bırakın.
              </p>
            </div>
          </div>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium text-zinc-300">
              Yetkiler
            </legend>
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
                  disabled={isPending || (isSelf && user.roles.includes("ADMIN"))}
                  onChange={(e) => setIsAdmin(e.target.checked)}
                />
                {ROLE_LABELS.ADMIN}
              </label>
            </div>
            {isSelf && user.roles.includes("ADMIN") ? (
              <p className="text-xs text-amber-300/90">
                Kendi Admin yetkinizi bu ekrandan kaldıramazsınız.
              </p>
            ) : null}
          </fieldset>

          {error ? (
            <p className="text-sm text-red-300" role="alert">
              {error}
            </p>
          ) : null}
        </DialogContent>

        <DialogFooter className="sm:justify-between">
          <div>
            {!isSelf ? (
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={() => {
                  setError(null);
                  setDeleteOpen(true);
                }}
              >
                <Trash2 className="size-4" />
                Sil
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              İptal
            </Button>
            <Button type="button" onClick={handleSave} disabled={isPending}>
              {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Kaydet
            </Button>
          </div>
        </DialogFooter>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogHeader>
          <DialogTitle>Kullanıcıyı Sil</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-zinc-200">{user.fullName}</span> (
            {user.email}) kalıcı olarak silinecek.
          </DialogDescription>
        </DialogHeader>
        <DialogContent>
          {error ? (
            <p className="text-sm text-red-300" role="alert">
              {error}
            </p>
          ) : (
            <p className="text-sm text-zinc-400">Bu işlem geri alınamaz.</p>
          )}
        </DialogContent>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setDeleteOpen(false)}
            disabled={isPending}
          >
            Vazgeç
          </Button>
          <Button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
          >
            {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Sil
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
