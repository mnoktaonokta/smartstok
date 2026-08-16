export type TaxpayerQueryResult =
  | {
      ok: true;
      isEInvoiceUser: boolean;
      alias?: string | null;
      /** Gönderici birim (GB) — bilgi amaçlı */
      senderAlias?: string | null;
      registrationDate?: string | null;
      raw?: unknown;
    }
  | { ok: false; error: string };

export type EArchiveSendResult =
  | {
      ok: true;
      uuid: string;
      faturaNo?: string | null;
      faturaURL?: string | null;
      pdfBase64?: string | null;
      raw?: unknown;
    }
  | { ok: false; error: string; raw?: unknown };

export type EInvoiceSendResult =
  | {
      ok: true;
      belgeOid: string;
      uuid: string;
      raw?: unknown;
    }
  | { ok: false; error: string; raw?: unknown };

export type OutgoingStatusResult =
  | {
      ok: true;
      status: "PROCESSING" | "COMPLETED" | "FAILED";
      message?: string | null;
      faturaNo?: string | null;
      faturaURL?: string | null;
      pdfBase64?: string | null;
      raw?: unknown;
    }
  | { ok: false; error: string; raw?: unknown };

export type DownloadOutgoingResult =
  | {
      ok: true;
      pdfBase64?: string | null;
      faturaURL?: string | null;
      raw?: unknown;
    }
  | { ok: false; error: string };

export type CancelEArchiveResult =
  | { ok: true; raw?: unknown }
  | { ok: false; error: string; raw?: unknown };

export type QnbCredentials = {
  username: string;
  password: string;
  vkn: string;
  erpKodu: string;
  environment: "TEST" | "LIVE";
  connectorWsdl: string;
  earchiveWsdl: string;
  live: boolean;
};

export type ElogoCredentials = {
  username: string;
  password: string;
  environment: "TEST" | "LIVE";
  /** PostBoxService endpoint (WSDL’siz) */
  endpoint: string;
  live: boolean;
};

export type EDocumentRefOptions = {
  documentType?: "EINVOICE" | "EARCHIVE" | "DESPATCHADVICE";
  /** e-Logo durum/PDF için ETTN; yoksa belgeOid kullanılır */
  uuid?: string | null;
};

export type DespatchSendResult =
  | {
      ok: true;
      uuid: string;
      belgeOid: string;
      raw?: unknown;
    }
  | { ok: false; error: string; raw?: unknown };

export type UblParty = {
  vknTckn: string;
  name: string;
  taxOffice?: string | null;
  address?: string | null;
  city?: string | null;
  district?: string | null;
  country?: string | null;
  phone?: string | null;
  email?: string | null;
};

export type UblLine = {
  id: number;
  name: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxRate: number;
  /** Görsel XSLT’te Malzeme/Hizmet Açıklaması (cbc:Description) */
  note?: string;
  /** Malzeme/Hizmet Kodu */
  sellersItemId?: string;
  /**
   * GİB TIBBICIHAZ AdditionalItemIdentification/ID değerleri
   * (adet kadar; her birim için bir kayıt).
   */
  tibbiCihazIds?: string[];
};

export type UblInvoiceInput = {
  uuid: string;
  /** GIB belge no: 3 serbest + 4 yıl + 9 rakam (örn. ABC2018000000001) */
  documentId: string;
  issueDate: string; // YYYY-MM-DD
  invoiceTypeCode: "SATIS";
  documentCurrencyCode: "TRY";
  profileId:
    | "EARSIVFATURA"
    | "TEMELFATURA"
    | "TICARIFATURA"
    | "ILAC_TIBBICIHAZ"
    | "KAMUFATURASI";
  supplier: UblParty;
  /** Muhasebe müşterisi (AccountingCustomerParty) — ana VKN */
  customer: UblParty;
  /**
   * Alıcı / harcama birimi (BuyerCustomerParty) — kamu faturalarında zorunlu.
   * Ana VKN muhasebe biriminde, harcama birimi VKN burada.
   */
  buyer?: UblParty | null;
  /** PayeeFinancialAccount IBAN (kamu faturalarında GİB zorunlu) */
  paymentIban?: string | null;
  lines: UblLine[];
  note?: string;
};
