import "server-only";

import type { IErpProvider } from "./IErpProvider";
import type {
  CreateDraftInvoiceResult,
  DraftInvoiceData,
  GetCustomerAbstractResult,
  SyncCustomersResult,
} from "./types";

/** e-Logo — iskelet (API dokümanına göre doldurulacak). */
export class LogoAdapter implements IErpProvider {
  constructor(
    private readonly creds: {
      firmNo: string;
      apiKey: string;
      username: string;
      password: string;
    },
  ) {}

  async syncCustomers(): Promise<SyncCustomersResult> {
    console.log("Logo API'ye istek atılacak", {
      method: "syncCustomers",
      firmNo: this.creds.firmNo || "(boş)",
    });
    return {
      ok: false,
      error:
        "e-Logo entegrasyonu henüz tamamlanmadı. Admin → Firma Bilgileri’nden Bizim Hesap seçin veya entegrasyonu tamamlayın.",
    };
  }

  async getCustomerAbstract(vkn: string): Promise<GetCustomerAbstractResult> {
    console.log("Logo API'ye istek atılacak", {
      method: "getCustomerAbstract",
      vkn,
    });
    return {
      ok: false,
      error: "e-Logo cari ekstre henüz desteklenmiyor.",
    };
  }

  async createDraftInvoice(
    invoiceData: DraftInvoiceData,
  ): Promise<CreateDraftInvoiceResult> {
    console.log("Logo API'ye istek atılacak", {
      method: "createDraftInvoice",
      invoiceNo: invoiceData.invoiceNo,
    });
    return {
      ok: false,
      error: "e-Logo fatura oluşturma henüz desteklenmiyor.",
    };
  }
}
