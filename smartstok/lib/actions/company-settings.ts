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
const eDocumentProviderEnum = z.enum(["QNB", "ELOGO"]);
const qnbEnvironmentEnum = z.enum(["TEST", "LIVE"]);
const elogoEnvironmentEnum = z.enum(["TEST", "LIVE"]);

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
  eDocumentProvider: "QNB" | "ELOGO";
  qnbUsername: string;
  qnbPassword: string;
  qnbErpKodu: string;
  qnbVkn: string;
  qnbEnvironment: "TEST" | "LIVE";
  elogoUsername: string;
  elogoPassword: string;
  elogoEnvironment: "TEST" | "LIVE";
  bankAccountInfo: string;
  hasLogo: boolean;
  logoPreviewUrl: string | null;
};

function emptyToNull(v: string): string | null {
  const t = v.trim();
  return t ? t : null;
}

function toForm(row: {
  companyName: string | null;
  address: string | null;
  vkn: string | null;
  taxOffice: string | null;
  phone: string | null;
  aiApiKey: string | null;
  utsFirmNo: string | null;
  utsToken: string | null;
  erpProvider: CompanySettingsForm["erpProvider"];
  bhFirmId: string | null;
  bhToken: string | null;
  bhApiKey: string | null;
  parasutCompanyId: string | null;
  parasutClientId: string | null;
  parasutClientSecret: string | null;
  parasutUsername: string | null;
  parasutPassword: string | null;
  logoFirmNo: string | null;
  logoApiKey: string | null;
  logoUsername: string | null;
  logoPassword: string | null;
  eDocumentProvider: CompanySettingsForm["eDocumentProvider"] | null;
  qnbUsername: string | null;
  qnbPassword: string | null;
  qnbErpKodu: string | null;
  qnbVkn: string | null;
  qnbEnvironment: string | null;
  elogoUsername: string | null;
  elogoPassword: string | null;
  elogoEnvironment: string | null;
  bankAccountInfo: string | null;
  logoMimeType?: string | null;
  updatedAt?: Date;
}): CompanySettingsForm {
  const env = (row.qnbEnvironment ?? "TEST").toUpperCase();
  const elogoEnv = (row.elogoEnvironment ?? "TEST").toUpperCase();
  const hasLogo = Boolean(row.logoMimeType?.trim());
  const logoPreviewUrl = hasLogo
    ? `/api/admin/company-logo?v=${row.updatedAt?.getTime() ?? Date.now()}`
    : null;
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
    eDocumentProvider: row.eDocumentProvider ?? "QNB",
    qnbUsername: row.qnbUsername ?? "",
    qnbPassword: row.qnbPassword ?? "",
    qnbErpKodu: row.qnbErpKodu ?? "",
    qnbVkn: row.qnbVkn ?? "",
    qnbEnvironment: env === "LIVE" ? "LIVE" : "TEST",
    elogoUsername: row.elogoUsername ?? "",
    elogoPassword: row.elogoPassword ?? "",
    elogoEnvironment: elogoEnv === "LIVE" ? "LIVE" : "TEST",
    bankAccountInfo: row.bankAccountInfo ?? "",
    hasLogo,
    logoPreviewUrl,
  };
}

async function loadSettingsForm(): Promise<CompanySettingsForm> {
  await getOrCreateCompanySettings();
  // logoData bilerek seçilmez — Server Action yanıtına binary/base64 sızmasın
  const row = await prisma.companySettings.findUniqueOrThrow({
    where: { id: SINGLETON_ID },
    select: {
      companyName: true,
      address: true,
      vkn: true,
      taxOffice: true,
      phone: true,
      aiApiKey: true,
      utsFirmNo: true,
      utsToken: true,
      erpProvider: true,
      bhFirmId: true,
      bhToken: true,
      bhApiKey: true,
      parasutCompanyId: true,
      parasutClientId: true,
      parasutClientSecret: true,
      parasutUsername: true,
      parasutPassword: true,
      logoFirmNo: true,
      logoApiKey: true,
      logoUsername: true,
      logoPassword: true,
      eDocumentProvider: true,
      qnbUsername: true,
      qnbPassword: true,
      qnbErpKodu: true,
      qnbVkn: true,
      qnbEnvironment: true,
      elogoUsername: true,
      elogoPassword: true,
      elogoEnvironment: true,
      bankAccountInfo: true,
      logoMimeType: true,
      updatedAt: true,
    },
  });
  return toForm(row);
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

function revalidateSettingsPaths() {
  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/admin/firma-bilgileri");
  revalidatePath("/dashboard/admin/entegrator");
  revalidatePath("/dashboard/admin/fatura-bilgileri");
  revalidatePath("/dashboard/customers");
  revalidatePath("/dashboard/invoices");
  revalidatePath("/dashboard/e-belge-fatura");
}

export async function getCompanySettingsAction(): Promise<{
  error?: string;
  settings?: CompanySettingsForm;
}> {
  const gate = await requireAdmin();
  if (gate.error) return { error: gate.error };

  try {
    return { settings: await loadSettingsForm() };
  } catch (error) {
    console.error("[getCompanySettingsAction]", error);
    return {
      error:
        "Firma ayarları okunamadı. Prisma şemasını db push ile güncellediğinizden emin olun.",
    };
  }
}

const profileSchema = z.object({
  companyName: z.string(),
  address: z.string(),
  vkn: z.string(),
  taxOffice: z.string(),
  phone: z.string(),
});

export async function upsertCompanyProfileAction(input: {
  companyName: string;
  address: string;
  vkn: string;
  taxOffice: string;
  phone: string;
}): Promise<{ error?: string; success?: boolean; settings?: CompanySettingsForm }> {
  try {
    const gate = await requireAdmin();
    if (gate.error) return { error: gate.error };

    const parsed = profileSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Geçersiz form." };
    }
    const d = parsed.data;

    await prisma.companySettings.upsert({
      where: { id: SINGLETON_ID },
      create: {
        id: SINGLETON_ID,
        companyName: emptyToNull(d.companyName),
        address: emptyToNull(d.address),
        vkn: emptyToNull(d.vkn),
        taxOffice: emptyToNull(d.taxOffice),
        phone: emptyToNull(d.phone),
      },
      update: {
        companyName: emptyToNull(d.companyName),
        address: emptyToNull(d.address),
        vkn: emptyToNull(d.vkn),
        taxOffice: emptyToNull(d.taxOffice),
        phone: emptyToNull(d.phone),
      },
    });

    revalidateSettingsPaths();
    return { success: true, settings: await loadSettingsForm() };
  } catch (error) {
    console.error("[upsertCompanyProfileAction]", error);
    return { error: "Firma bilgileri kaydedilemedi." };
  }
}

const ALLOWED_LOGO_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);
const MAX_LOGO_BYTES = 1_500_000;

function mimeFromFileName(name: string): string | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return null;
}

function prismaErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message.replace(/\s+/g, " ").trim().slice(0, 220);
    return msg || "Logo yüklenemedi.";
  }
  return "Logo yüklenemedi.";
}

export async function uploadCompanyLogoAction(
  formData: FormData,
): Promise<{ error?: string; success?: boolean; settings?: CompanySettingsForm }> {
  try {
    const gate = await requireAdmin();
    if (gate.error) return { error: gate.error };

    const raw = formData.get("logo");
    // Next.js server action’da File/Blob realm farkı → instanceof File güvenilmez
    const blob =
      raw &&
      typeof raw === "object" &&
      "arrayBuffer" in raw &&
      typeof (raw as Blob).arrayBuffer === "function"
        ? (raw as Blob)
        : null;
    if (!blob || blob.size === 0) {
      return { error: "Logo dosyası seçin." };
    }
    if (blob.size > MAX_LOGO_BYTES) {
      return { error: "Logo en fazla 1,5 MB olabilir." };
    }

    const fileName =
      "name" in blob && typeof (blob as File).name === "string"
        ? (blob as File).name
        : "";
    const mime =
      (blob.type && blob.type.trim()) ||
      mimeFromFileName(fileName) ||
      "";
    const normalizedMime =
      mime === "image/jpg" ? "image/jpeg" : mime.toLowerCase();
    if (!ALLOWED_LOGO_TYPES.has(normalizedMime)) {
      return {
        error: `Desteklenmeyen dosya türü${mime ? ` (${mime})` : ""}. PNG, JPEG, WebP veya GIF yükleyin.`,
      };
    }

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const mimeStored =
      normalizedMime === "image/jpg" ? "image/jpeg" : normalizedMime;
    await prisma.companySettings.upsert({
      where: { id: SINGLETON_ID },
      create: {
        id: SINGLETON_ID,
        logoData: bytes,
        logoMimeType: mimeStored,
      },
      update: {
        logoData: bytes,
        logoMimeType: mimeStored,
      },
    });

    revalidateSettingsPaths();
    return { success: true, settings: await loadSettingsForm() };
  } catch (error) {
    console.error("[uploadCompanyLogoAction]", error);
    return { error: prismaErrorMessage(error) };
  }
}

export async function clearCompanyLogoAction(): Promise<{
  error?: string;
  success?: boolean;
  settings?: CompanySettingsForm;
}> {
  try {
    const gate = await requireAdmin();
    if (gate.error) return { error: gate.error };

    await prisma.companySettings.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, logoData: null, logoMimeType: null },
      update: { logoData: null, logoMimeType: null },
    });

    revalidateSettingsPaths();
    return { success: true, settings: await loadSettingsForm() };
  } catch (error) {
    console.error("[clearCompanyLogoAction]", error);
    return { error: "Logo silinemedi." };
  }
}

const integratorSchema = z.object({
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
  aiApiKey: z.string(),
  utsFirmNo: z.string(),
  utsToken: z.string(),
});

export async function upsertIntegratorSettingsAction(
  input: z.infer<typeof integratorSchema>,
): Promise<{ error?: string; success?: boolean; settings?: CompanySettingsForm }> {
  try {
    const gate = await requireAdmin();
    if (gate.error) return { error: gate.error };

    const parsed = integratorSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Geçersiz form." };
    }
    const d = parsed.data;

    await prisma.companySettings.upsert({
      where: { id: SINGLETON_ID },
      create: {
        id: SINGLETON_ID,
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
        aiApiKey: emptyToNull(d.aiApiKey),
        utsFirmNo: emptyToNull(d.utsFirmNo),
        utsToken: emptyToNull(d.utsToken),
      },
      update: {
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
        aiApiKey: emptyToNull(d.aiApiKey),
        utsFirmNo: emptyToNull(d.utsFirmNo),
        utsToken: emptyToNull(d.utsToken),
      },
    });

    revalidateSettingsPaths();
    return { success: true, settings: await loadSettingsForm() };
  } catch (error) {
    console.error("[upsertIntegratorSettingsAction]", error);
    return { error: "Entegratör ayarları kaydedilemedi." };
  }
}

const invoiceSettingsSchema = z.object({
  eDocumentProvider: eDocumentProviderEnum,
  qnbUsername: z.string(),
  qnbPassword: z.string(),
  qnbErpKodu: z.string(),
  qnbVkn: z.string(),
  qnbEnvironment: qnbEnvironmentEnum,
  elogoUsername: z.string(),
  elogoPassword: z.string(),
  elogoEnvironment: elogoEnvironmentEnum,
  bankAccountInfo: z.string(),
});

export async function upsertInvoiceSettingsAction(
  input: z.infer<typeof invoiceSettingsSchema>,
): Promise<{ error?: string; success?: boolean; settings?: CompanySettingsForm }> {
  try {
    const gate = await requireAdmin();
    if (gate.error) return { error: gate.error };

    const parsed = invoiceSettingsSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Geçersiz form." };
    }
    const d = parsed.data;

    await prisma.companySettings.upsert({
      where: { id: SINGLETON_ID },
      create: {
        id: SINGLETON_ID,
        eDocumentProvider: d.eDocumentProvider,
        qnbUsername: emptyToNull(d.qnbUsername),
        qnbPassword: emptyToNull(d.qnbPassword),
        qnbErpKodu: emptyToNull(d.qnbErpKodu),
        qnbVkn: emptyToNull(d.qnbVkn),
        qnbEnvironment: d.qnbEnvironment,
        elogoUsername: emptyToNull(d.elogoUsername),
        elogoPassword: emptyToNull(d.elogoPassword),
        elogoEnvironment: d.elogoEnvironment,
        bankAccountInfo: emptyToNull(d.bankAccountInfo),
      },
      update: {
        eDocumentProvider: d.eDocumentProvider,
        qnbUsername: emptyToNull(d.qnbUsername),
        qnbPassword: emptyToNull(d.qnbPassword),
        qnbErpKodu: emptyToNull(d.qnbErpKodu),
        qnbVkn: emptyToNull(d.qnbVkn),
        qnbEnvironment: d.qnbEnvironment,
        elogoUsername: emptyToNull(d.elogoUsername),
        elogoPassword: emptyToNull(d.elogoPassword),
        elogoEnvironment: d.elogoEnvironment,
        bankAccountInfo: emptyToNull(d.bankAccountInfo),
      },
    });

    revalidateSettingsPaths();
    return { success: true, settings: await loadSettingsForm() };
  } catch (error) {
    console.error("[upsertInvoiceSettingsAction]", error);
    return { error: "Fatura bilgileri kaydedilemedi." };
  }
}
