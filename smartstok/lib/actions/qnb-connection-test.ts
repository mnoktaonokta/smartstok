"use server";

import { z } from "zod";
import { auth } from "@/auth";
import { hasRole } from "@/lib/roles";
import { QnbEsolutionsAdapter } from "@/lib/services/edocument/QnbEsolutionsAdapter";
import { resolveQnbCredentials } from "@/lib/services/edocument/credentials";
import type { CompanySettings } from "@/app/generated/prisma/client";
import { getOrCreateCompanySettings } from "@/lib/services/erp/company-settings";

const testSchema = z.object({
  /** Sorgulanacak alıcı VKN/TCKN — boşsa firma VKN */
  queryVkn: z.string().optional(),
  /** Formdaki güncel değerler (henüz kaydedilmemiş olabilir) */
  qnbUsername: z.string().optional(),
  qnbPassword: z.string().optional(),
  qnbErpKodu: z.string().optional(),
  qnbVkn: z.string().optional(),
  qnbEnvironment: z.enum(["TEST", "LIVE"]).optional(),
  companyVkn: z.string().optional(),
});

/**
 * Fatura kesmeden QNB `efaturaKullaniciBilgisi` ile bağlantı / auth testi.
 * Kullanıcı adı + şifre zorunlu (SOAP Header); anonim sorgu yok.
 */
export async function testQnbConnectionAction(
  input: z.infer<typeof testSchema>,
): Promise<{
  error?: string;
  ok?: boolean;
  mode?: "mock" | "live";
  environment?: "TEST" | "LIVE";
  message?: string;
  isEInvoiceUser?: boolean;
  alias?: string | null;
  registrationDate?: string | null;
  queriedVkn?: string;
}> {
  try {
    const session = await auth();
    if (!session?.user?.id) return { error: "Oturum bulunamadı." };
    if (!hasRole(session.user.roles, "ADMIN")) {
      return { error: "Bu işlem için ADMIN yetkisi gerekli." };
    }

    const parsed = testSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Geçersiz istek." };
    }

    const saved = await getOrCreateCompanySettings();
    const d = parsed.data;

    // Form değerleri kayıtlı ayarların üzerine yazılır (Kaydetmeden test)
    const overlay = {
      ...saved,
      qnbUsername: d.qnbUsername?.trim() || saved.qnbUsername,
      qnbPassword: d.qnbPassword?.trim() || saved.qnbPassword,
      qnbErpKodu: d.qnbErpKodu?.trim() || saved.qnbErpKodu,
      qnbVkn: d.qnbVkn?.trim() || saved.qnbVkn,
      qnbEnvironment: d.qnbEnvironment || saved.qnbEnvironment,
      vkn: d.companyVkn?.trim() || saved.vkn,
    } as CompanySettings;

    const resolved = resolveQnbCredentials(overlay);
    if (!resolved.ok) return { error: resolved.error };

    const queryVkn = (
      d.queryVkn?.trim() ||
      overlay.qnbVkn?.trim() ||
      overlay.vkn?.trim() ||
      ""
    ).replace(/\s/g, "");

    if (!queryVkn || (queryVkn.length !== 10 && queryVkn.length !== 11)) {
      return {
        error:
          "Sorgulanacak VKN/TCKN girin (10 veya 11 hane) veya Firma VKN’yi doldurun.",
      };
    }

    const adapter = new QnbEsolutionsAdapter(resolved.creds);
    const result = await adapter.queryTaxpayer(queryVkn);

    if (!result.ok) {
      return {
        error: result.error,
        mode: resolved.creds.live ? "live" : "mock",
        environment: resolved.creds.environment,
        queriedVkn: queryVkn,
      };
    }

    const mode = resolved.creds.live ? "live" : "mock";
    const tip = result.isEInvoiceUser ? "e-Fatura mükellefi" : "e-Arşiv / kayıtlı değil";

    if (mode === "mock") {
      return {
        ok: true,
        mode: "mock",
        environment: resolved.creds.environment,
        queriedVkn: queryVkn,
        isEInvoiceUser: result.isEInvoiceUser,
        message:
          "Mock yanıt (kullanıcı/şifre/VKN eksik veya QNB_FORCE_MOCK=1). Gerçek QNB’ye gidilmedi. Bilgileri doldurup tekrar deneyin.",
      };
    }

    return {
      ok: true,
      mode: "live",
      environment: resolved.creds.environment,
      queriedVkn: queryVkn,
      isEInvoiceUser: result.isEInvoiceUser,
      alias: result.alias,
      registrationDate: result.registrationDate,
      message: `QNB yanıt verdi (${resolved.creds.environment}). ${queryVkn}: ${tip}.${
        result.alias ? ` Etiket: ${result.alias}` : ""
      }`,
    };
  } catch (error) {
    console.error("[testQnbConnectionAction]", error);
    return {
      error:
        error instanceof Error
          ? error.message
          : "QNB bağlantı testi başarısız.",
    };
  }
}
