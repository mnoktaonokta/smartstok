import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * JWT oturumundaki user.id DB’de yoksa (reset/reseed sonrası) e-posta ile
 * bulmaya çalışır. TransferLog vb. FK’ler için gerçek User.id döner.
 */
export async function resolveActingUserId(sessionUser: {
  id?: string | null;
  email?: string | null;
}): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const id = sessionUser.id?.trim();
  if (id) {
    const byId = await prisma.user.findUnique({
      where: { id },
      select: { id: true, isActive: true },
    });
    if (byId?.isActive) return { ok: true, userId: byId.id };
    if (byId && !byId.isActive) {
      return { ok: false, error: "Hesabınız pasif. Yönetici ile iletişime geçin." };
    }
  }

  const email = sessionUser.email?.trim().toLowerCase();
  if (email) {
    const byEmail = await prisma.user.findUnique({
      where: { email },
      select: { id: true, isActive: true },
    });
    if (byEmail?.isActive) return { ok: true, userId: byEmail.id };
    if (byEmail && !byEmail.isActive) {
      return { ok: false, error: "Hesabınız pasif. Yönetici ile iletişime geçin." };
    }
  }

  return {
    ok: false,
    error:
      "Oturum geçersiz veya kullanıcı veritabanında bulunamadı. Çıkış yapıp tekrar giriş yapın.",
  };
}
