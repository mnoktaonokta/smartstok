import type {
  CancelEArchiveResult,
  DespatchSendResult,
  DownloadOutgoingResult,
  EArchiveSendResult,
  EDocumentRefOptions,
  EInvoiceSendResult,
  IncomingResponseResult,
  ListIncomingResult,
  OutgoingStatusResult,
  TaxpayerQueryResult,
} from "./types";

/** Ortak e-belge sağlayıcı sözleşmesi (QNB / e-Logo). */
export interface IDocumentProvider {
  queryTaxpayer(vknTckn: string): Promise<TaxpayerQueryResult>;
  sendEArchive(input: {
    ublXml: string;
    uuid: string;
    /** 3 = PDF */
    donenBelgeFormati?: number;
    taslagaYonlendir?: number;
  }): Promise<EArchiveSendResult>;
  sendEInvoice(input: {
    ublXml: string;
    uuid: string;
    belgeTuru?: string;
    /** Alıcı PK etiketi (e-Logo ALIAS) */
    alias?: string | null;
  }): Promise<EInvoiceSendResult>;
  /** e-İrsaliye (DESPATCHADVICE). QNB’de desteklenmez. */
  sendDespatch(input: {
    ublXml: string;
    uuid: string;
    alias?: string | null;
  }): Promise<DespatchSendResult>;
  getOutgoingStatus(
    belgeOid: string,
    options?: EDocumentRefOptions,
  ): Promise<OutgoingStatusResult>;
  downloadOutgoing(
    belgeOid: string,
    options?: EDocumentRefOptions,
  ): Promise<DownloadOutgoingResult>;
  /** Yalnızca e-Arşiv. e-Fatura için çağrılmaz. */
  cancelEArchive(input: {
    uuid: string;
    faturaNo?: string | null;
    vknTckn?: string | null;
  }): Promise<CancelEArchiveResult>;
  listIncomingInvoices(input: {
    from: string;
    to: string;
  }): Promise<ListIncomingResult>;
  downloadIncoming(uuid: string): Promise<DownloadOutgoingResult>;
  sendIncomingResponse(input: {
    uuid: string;
    decision: "KABUL" | "RED";
    description: string;
    alias?: string | null;
  }): Promise<IncomingResponseResult>;
}
