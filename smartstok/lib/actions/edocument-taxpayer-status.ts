"use server";

import { auth } from "@/auth";
import { assertCanMutate } from "@/lib/roles";
import { EDocumentFactory } from "@/lib/services/edocument/EDocumentFactory";

/**
 * Seçilen müşteri VKN’si için e-Fatura / e-Arşiv durumu (entegratör sorgusu).
 */
export async function queryCustomerEDocumentStatusAction(vknTckn: string): Promise<{
  error?: string;
  isEInvoiceUser?: boolean;
  alias?: string | null;
  registrationDate?: string | null;
  message?: string;
}> {
  try {
    const session = await auth();
    if (!session?.user?.id) return { error: "Oturum bulunamadı." };
    assertCanMutate(session.user.roles);

    const digits = vknTckn.replace(/\D/g, "");
    if (digits.length !== 10 && digits.length !== 11) {
      return { error: "Geçerli VKN/TCKN gerekli." };
    }

    const factory = await EDocumentFactory.getInstance();
    if (!factory.ok) return { error: factory.error };

    const result = await factory.provider.queryTaxpayer(digits);
    if (!result.ok) return { error: result.error };

    let dateLabel: string | null = null;
    if (result.registrationDate) {
      const d = new Date(result.registrationDate);
      if (!Number.isNaN(d.getTime())) {
        dateLabel = d.toLocaleDateString("tr-TR");
      } else if (/^\d{4}-\d{2}-\d{2}/.test(result.registrationDate)) {
        const [y, m, day] = result.registrationDate.slice(0, 10).split("-");
        dateLabel = `${day}.${m}.${y}`;
      }
    }

    if (result.isEInvoiceUser) {
      return {
        isEInvoiceUser: true,
        alias: result.alias,
        registrationDate: result.registrationDate,
        message: dateLabel
          ? `E-Fatura müşterisi. Bu müşteri ${dateLabel} itibariyle e-fatura mükellefidir.`
          : "E-Fatura müşterisi. Bu müşteri e-fatura mükellefidir; fatura e-Fatura olarak kesilir.",
      };
    }

    return {
      isEInvoiceUser: false,
      alias: null,
      registrationDate: null,
      message:
        "E-Arşiv müşterisi. Entegratör listesinde e-fatura mükellefi görünmüyor; fatura e-Arşiv olarak kesilir.",
    };
  } catch (error) {
    console.error("[queryCustomerEDocumentStatusAction]", error);
    return {
      error:
        error instanceof Error
          ? error.message
          : "Mükellef durumu sorgulanamadı.",
    };
  }
}
