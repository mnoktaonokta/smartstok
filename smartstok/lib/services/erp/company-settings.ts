import "server-only";

import { prisma } from "@/lib/prisma";
import type { CompanySettings } from "@/app/generated/prisma/client";

const SINGLETON_ID = 1;

function defaultLicenseEndDate() {
  const end = new Date();
  end.setFullYear(end.getFullYear() + 1);
  return end;
}

/** Env’den ilk kayıt için varsayılanlar (geçiş dönemi). */
function defaultsFromEnv() {
  return {
    bhFirmId: process.env.BIZIMHESAP_FIRM_ID?.trim() || null,
    bhToken: process.env.BIZIMHESAP_TOKEN?.trim() || null,
    bhApiKey: process.env.BIZIMHESAP_API_KEY?.trim() || null,
    utsFirmNo: process.env.UTS_FIRM_NO?.trim() || null,
    utsToken: process.env.UTS_TOKEN?.trim() || null,
    aiApiKey:
      process.env.AI_API_KEY?.trim() ||
      process.env.OPENAI_API_KEY?.trim() ||
      null,
    erpProvider: "BIZIMHESAP" as const,
    licenseEndDate: defaultLicenseEndDate(),
  };
}

/** id=1 kaydını getirir; yoksa env ile oluşturur. */
export async function getOrCreateCompanySettings(): Promise<CompanySettings> {
  const existing = await prisma.companySettings.findUnique({
    where: { id: SINGLETON_ID },
  });
  if (existing) {
    // Eski kayıtlarda lisans tarihi yoksa 1 yıl tanımla (ilk migration)
    if (!existing.licenseEndDate) {
      return prisma.companySettings.update({
        where: { id: SINGLETON_ID },
        data: { licenseEndDate: defaultLicenseEndDate() },
      });
    }
    return existing;
  }

  return prisma.companySettings.create({
    data: {
      id: SINGLETON_ID,
      ...defaultsFromEnv(),
    },
  });
}

export { SINGLETON_ID };
