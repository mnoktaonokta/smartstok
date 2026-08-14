"use server";

import { z } from "zod";
import { auth } from "@/auth";
import { hasRole } from "@/lib/roles";
import { ELogoDocumentAdapter } from "@/lib/services/edocument/ELogoDocumentAdapter";
import { resolveElogoCredentials } from "@/lib/services/edocument/credentials";
import type { CompanySettings } from "@/app/generated/prisma/client";
import { getOrCreateCompanySettings } from "@/lib/services/erp/company-settings";

const testSchema = z.object({
  queryVkn: z.string().optional(),
  elogoUsername: z.string().optional(),
  elogoPassword: z.string().optional(),
  elogoEnvironment: z.enum(["TEST", "LIVE"]).optional(),
  companyVkn: z.string().optional(),
});

/**
 * Fatura kesmeden e-Logo Login + CheckGibUser bağlantı testi.
 */
export async function testElogoConnectionAction(
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

    const overlay = {
      ...saved,
      elogoUsername: d.elogoUsername?.trim() || saved.elogoUsername,
      elogoPassword: d.elogoPassword?.trim() || saved.elogoPassword,
      elogoEnvironment: d.elogoEnvironment || saved.elogoEnvironment,
      vkn: d.companyVkn?.trim() || saved.vkn,
    } as CompanySettings;

    const resolved = resolveElogoCredentials(overlay);
    if (!resolved.ok) return { error: resolved.error };

    const queryVkn = (
      d.queryVkn?.trim() ||
      overlay.vkn?.trim() ||
      ""
    ).replace(/\s/g, "");

    if (!queryVkn || (queryVkn.length !== 10 && queryVkn.length !== 11)) {
      return {
        error:
          "Sorgulanacak VKN/TCKN girin (10 veya 11 hane) veya Firma VKN’yi doldurun.",
      };
    }

    const adapter = new ELogoDocumentAdapter(resolved.creds);
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
    const tip = result.isEInvoiceUser
      ? "e-Fatura mükellefi"
      : "e-Arşiv / kayıtlı değil";

    if (mode === "mock") {
      return {
        ok: true,
        mode: "mock",
        environment: resolved.creds.environment,
        queriedVkn: queryVkn,
        isEInvoiceUser: result.isEInvoiceUser,
        message:
          "Mock yanıt (kullanıcı/şifre eksik veya ELOGO_FORCE_MOCK=1). Gerçek e-Logo’ya gidilmedi.",
      };
    }

    const raw = result.raw as
      | {
          invoiceCount?: number | null;
          hasPkList?: boolean;
          hasGbList?: boolean;
          pkNil?: boolean;
          gbNil?: boolean;
          pkAliasCount?: number;
          gbAliasCount?: number;
          pkSnippet?: string;
          gbSnippet?: string;
          mailAliases?: string[];
        }
      | undefined;

    const parts = [
      `e-Logo yanıt verdi (${resolved.creds.environment}).`,
      `${queryVkn}: ${tip}.`,
    ];
    if (result.alias) {
      parts.push(`PK (alıcı): ${result.alias}.`);
    }
    if (result.senderAlias) {
      parts.push(`GB (gönderici): ${result.senderAlias}.`);
    }
    if (!result.alias && !result.senderAlias) {
      const inv =
        raw?.invoiceCount != null ? `Invoice=${raw.invoiceCount}` : "Invoice=?";
      const pk = raw?.pkNil
        ? "PkList=nil"
        : `PkList alias=${raw?.pkAliasCount ?? 0}`;
      const gb = raw?.gbNil
        ? "GbList=nil"
        : `GbList alias=${raw?.gbAliasCount ?? 0}`;
      parts.push(`Etiket yok (${inv}, ${pk}, ${gb}).`);
      if (raw?.pkSnippet) parts.push(`Pk içerik: ${raw.pkSnippet}`);
      if (raw?.gbSnippet) parts.push(`Gb içerik: ${raw.gbSnippet}`);
      if (!result.isEInvoiceUser) {
        parts.push(
          "Bu VKN e-Logo listesinde e-Fatura mükellefi görünmüyor; fatura e-Arşiv olarak kesilir (veya GIB listesi gecikmeli olabilir).",
        );
      }
    }

    return {
      ok: true,
      mode: "live",
      environment: resolved.creds.environment,
      queriedVkn: queryVkn,
      isEInvoiceUser: result.isEInvoiceUser,
      alias: result.alias,
      registrationDate: result.registrationDate,
      message: parts.join(" "),
    };
  } catch (error) {
    console.error("[testElogoConnectionAction]", error);
    return {
      error:
        error instanceof Error
          ? error.message
          : "e-Logo bağlantı testi başarısız.",
    };
  }
}
