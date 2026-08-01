import type {
  CreateDraftInvoiceResult,
  DraftInvoiceData,
  GetCustomerAbstractResult,
  SyncCustomersResult,
} from "./types";

/**
 * Muhasebe / e-fatura entegratör sözleşmesi.
 */
export interface IErpProvider {
  /** Uzak sistemdeki müşterileri listeler (SmartStok upsert’i action katmanında). */
  syncCustomers(): Promise<SyncCustomersResult>;

  /**
   * Cari ekstre.
   * @param vkn VKN/TCKN veya sağlayıcıya göre harici cari kodu
   */
  getCustomerAbstract(vkn: string): Promise<GetCustomerAbstractResult>;

  /** Taslak / satış faturası oluşturur. */
  createDraftInvoice(
    invoiceData: DraftInvoiceData,
  ): Promise<CreateDraftInvoiceResult>;
}
