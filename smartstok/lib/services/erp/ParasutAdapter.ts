import "server-only";

import type { IErpProvider } from "./IErpProvider";
import type {
  CreateDraftInvoiceResult,
  DraftInvoiceData,
  GetCustomerAbstractResult,
  SyncCustomersResult,
} from "./types";

/** Paraşüt — iskelet (API dokümanına göre doldurulacak). */
export class ParasutAdapter implements IErpProvider {
  constructor(
    private readonly creds: {
      companyId: string;
      clientId: string;
      clientSecret: string;
      username: string;
      password: string;
    },
  ) {}

  async syncCustomers(): Promise<SyncCustomersResult> {
    console.log("Paraşüt API'ye istek atılacak", {
      method: "syncCustomers",
      companyId: this.creds.companyId || "(boş)",
    });
    return {
      ok: false,
      error:
        "Paraşüt entegrasyonu henüz tamamlanmadı. Admin → Firma Bilgileri’nden Bizim Hesap seçin veya entegrasyonu tamamlayın.",
    };
  }

  async getCustomerAbstract(vkn: string): Promise<GetCustomerAbstractResult> {
    console.log("Paraşüt API'ye istek atılacak", {
      method: "getCustomerAbstract",
      vkn,
    });
    return {
      ok: false,
      error: "Paraşüt cari ekstre henüz desteklenmiyor.",
    };
  }

  async createDraftInvoice(
    invoiceData: DraftInvoiceData,
  ): Promise<CreateDraftInvoiceResult> {
    console.log("Paraşüt API'ye istek atılacak", {
      method: "createDraftInvoice",
      invoiceNo: invoiceData.invoiceNo,
    });
    return {
      ok: false,
      error: "Paraşüt fatura oluşturma henüz desteklenmiyor.",
    };
  }
}
