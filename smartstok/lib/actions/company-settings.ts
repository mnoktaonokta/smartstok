"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { hasRole } from "@/lib/roles";
import {
  getOrCreateCompanySettings,
  SINGLETON_ID,
} from "@/lib/services/erp/company-settings";

const erpProviderEnum = z.enum(["BIZIMHESAP", "ELOGO", "PARASUT"]);

export type CompanySettingsForm = {
  companyName: string;
  address: string;
  vkn: string;
  taxOffice: string;
  phone: string;
  aiApiKey: string;
  utsFirmNo: string;
  utsToken: string;
  erpProvider: "BIZIMHESAP" | "ELOGO" | "PARASUT";
  bhFirmId: string;
  bhToken: string;
  bhApiKey: string;
  parasutCompanyId: string;
  parasutClientId: string;
  parasutClientSecret: string;
  parasutUsername: string;
  parasutPassword: string;
  logoFirmNo: string;
  logoApiKey: string;
  logoUsername: string;
  logoPassword: string;
};

function toForm(
  row: Awaited<ReturnType<typeof getOrCreateCompanySettings>>,
): CompanySettingsForm {
  return {
    companyName: row.companyName ?? "",
    address: row.address ?? "",
    vkn: row.vkn ?? "",
    taxOffice: row.taxOffice ?? "",
    phone: row.phone ?? "",
    aiApiKey: row.aiApiKey ?? "",
    utsFirmNo: row.utsFirmNo ?? "",
    utsToken: row.utsToken ?? "",
    erpProvider: row.erpProvider,
    bhFirmId: row.bhFirmId ?? "",
    bhToken: row.bhToken ?? "",
    bhApiKey: row.bhApiKey ?? "",
    parasutCompanyId: row.parasutCompanyId ?? "",
    parasutClientId: row.parasutClientId ?? "",
    parasutClientSecret: row.parasutClientSecret ?? "",
    parasutUsername: row.parasutUsername ?? "",
    parasutPassword: row.parasutPassword ?? "",
    logoFirmNo: row.logoFirmNo ?? "",
    logoApiKey: row.logoApiKey ?? "",
    logoUsername: row.logoUsername ?? "",
    logoPassword: row.logoPassword ?? "",
  };
}

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Oturum bulunamadı." as const, session: null };
  }
  if (!hasRole(session.user.roles, "ADMIN")) {
    return { error: "Bu işlem için ADMIN yetkisi gerekli." as const, session: null };
  }
  return { error: null, session };
}

export async function getCompanySettingsAction(): Promise<{
  error?: string;
  settings?: CompanySettingsForm;
}> {
  const gate = await requireAdmin();
  if (gate.error) return { error: gate.error };

  try {
    const row = await getOrCreateCompanySettings();
    return { settings: toForm(row) };
  } catch (error) {
    console.error("[getCompanySettingsAction]", error);
    return {
      error:
        "Firma ayarları okunamadı. Prisma şemasını db push ile güncellediğinizden emin olun.",
    };
  }
}

const upsertSchema = z.object({
  companyName: z.string(),
  address: z.string(),
  vkn: z.string(),
  taxOffice: z.string(),
  phone: z.string(),
  aiApiKey: z.string(),
  utsFirmNo: z.string(),
  utsToken: z.string(),
  erpProvider: erpProviderEnum,
  bhFirmId: z.string(),
  bhToken: z.string(),
  bhApiKey: z.string(),
  parasutCompanyId: z.string(),
  parasutClientId: z.string(),
  parasutClientSecret: z.string(),
  parasutUsername: z.string(),
  parasutPassword: z.string(),
  logoFirmNo: z.string(),
  logoApiKey: z.string(),
  logoUsername: z.string(),
  logoPassword: z.string(),
});

function emptyToNull(v: string): string | null {
  const t = v.trim();
  return t ? t : null;
}

export async function upsertCompanySettingsAction(
  input: CompanySettingsForm,
): Promise<{ error?: string; success?: boolean; settings?: CompanySettingsForm }> {
  try {
    const gate = await requireAdmin();
    if (gate.error) return { error: gate.error };

    const parsed = upsertSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Geçersiz form." };
    }
    const d = parsed.data;

    const row = await prisma.companySettings.upsert({
      where: { id: SINGLETON_ID },
      create: {
        id: SINGLETON_ID,
        companyName: emptyToNull(d.companyName),
        address: emptyToNull(d.address),
        vkn: emptyToNull(d.vkn),
        taxOffice: emptyToNull(d.taxOffice),
        phone: emptyToNull(d.phone),
        aiApiKey: emptyToNull(d.aiApiKey),
        utsFirmNo: emptyToNull(d.utsFirmNo),
        utsToken: emptyToNull(d.utsToken),
        erpProvider: d.erpProvider,
        bhFirmId: emptyToNull(d.bhFirmId),
        bhToken: emptyToNull(d.bhToken),
        bhApiKey: emptyToNull(d.bhApiKey),
        parasutCompanyId: emptyToNull(d.parasutCompanyId),
        parasutClientId: emptyToNull(d.parasutClientId),
        parasutClientSecret: emptyToNull(d.parasutClientSecret),
        parasutUsername: emptyToNull(d.parasutUsername),
        parasutPassword: emptyToNull(d.parasutPassword),
        logoFirmNo: emptyToNull(d.logoFirmNo),
        logoApiKey: emptyToNull(d.logoApiKey),
        logoUsername: emptyToNull(d.logoUsername),
        logoPassword: emptyToNull(d.logoPassword),
      },
      update: {
        companyName: emptyToNull(d.companyName),
        address: emptyToNull(d.address),
        vkn: emptyToNull(d.vkn),
        taxOffice: emptyToNull(d.taxOffice),
        phone: emptyToNull(d.phone),
        aiApiKey: emptyToNull(d.aiApiKey),
        utsFirmNo: emptyToNull(d.utsFirmNo),
        utsToken: emptyToNull(d.utsToken),
        erpProvider: d.erpProvider,
        bhFirmId: emptyToNull(d.bhFirmId),
        bhToken: emptyToNull(d.bhToken),
        bhApiKey: emptyToNull(d.bhApiKey),
        parasutCompanyId: emptyToNull(d.parasutCompanyId),
        parasutClientId: emptyToNull(d.parasutClientId),
        parasutClientSecret: emptyToNull(d.parasutClientSecret),
        parasutUsername: emptyToNull(d.parasutUsername),
        parasutPassword: emptyToNull(d.parasutPassword),
        logoFirmNo: emptyToNull(d.logoFirmNo),
        logoApiKey: emptyToNull(d.logoApiKey),
        logoUsername: emptyToNull(d.logoUsername),
        logoPassword: emptyToNull(d.logoPassword),
      },
    });

    revalidatePath("/dashboard/admin");
    revalidatePath("/dashboard/customers");
    revalidatePath("/dashboard/invoices");

    return { success: true, settings: toForm(row) };
  } catch (error) {
    console.error("[upsertCompanySettingsAction]", error);
    return { error: "Firma bilgileri kaydedilemedi." };
  }
}
