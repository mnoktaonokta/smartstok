"use server";

import { timingSafeEqual } from "crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  getOrCreateCompanySettings,
  SINGLETON_ID,
} from "@/lib/services/erp/company-settings";

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export async function verifyMasterSecretAction(
  password: string,
): Promise<{ error?: string; ok?: boolean }> {
  const secret = process.env.MASTER_SECRET?.trim();
  if (!secret) {
    return {
      error:
        "MASTER_SECRET tanımlı değil. Sunucu .env dosyasını kontrol edin.",
    };
  }
  if (!password || !safeEqual(password, secret)) {
    return { error: "Master şifre hatalı." };
  }
  return { ok: true };
}

function addLicensePeriod(
  current: Date | null | undefined,
  months: number,
): Date {
  const now = new Date();
  const base =
    current && current.getTime() > now.getTime() ? new Date(current) : now;
  const next = new Date(base);
  next.setMonth(next.getMonth() + months);
  return next;
}

export async function extendLicenseAction(input: {
  password: string;
  months: 1 | 12;
}): Promise<{ error?: string; success?: boolean; licenseEndDate?: string }> {
  const secret = process.env.MASTER_SECRET?.trim();
  if (!secret) {
    return { error: "MASTER_SECRET tanımlı değil." };
  }
  if (!input.password || !safeEqual(input.password, secret)) {
    return { error: "Master şifre hatalı veya oturum geçersiz." };
  }

  try {
    await getOrCreateCompanySettings();
    const existing = await prisma.companySettings.findUnique({
      where: { id: SINGLETON_ID },
      select: { licenseEndDate: true },
    });

    const next = addLicensePeriod(existing?.licenseEndDate, input.months);

    await prisma.companySettings.update({
      where: { id: SINGLETON_ID },
      data: { licenseEndDate: next },
    });

    revalidatePath("/dashboard");
    revalidatePath("/", "layout");

    return {
      success: true,
      licenseEndDate: next.toISOString(),
    };
  } catch (error) {
    console.error("[extendLicenseAction]", error);
    return { error: "Lisans uzatılamadı. Veritabanını kontrol edin." };
  }
}
