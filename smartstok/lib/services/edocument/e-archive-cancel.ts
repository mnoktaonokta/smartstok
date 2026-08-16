/** e-Arşiv iptal penceresi (GİB / pratik üst sınır). */
export const EARCHIVE_CANCEL_WINDOW_DAYS = 7;

export type InvoiceCancelEligibility = {
  canCancel: boolean;
  reason: string;
};

export function eArchiveCancelEligibility(invoice: {
  documentType: string | null | undefined;
  docStatus: string | null | undefined;
  uuid: string | null | undefined;
  createdAt: Date | string;
  bizimHesapGuid?: string | null;
}): InvoiceCancelEligibility {
  if (invoice.bizimHesapGuid && invoice.documentType !== "EARCHIVE") {
    return {
      canCancel: false,
      reason: "Bizim Hesap faturaları burada iptal edilmez.",
    };
  }
  if (invoice.documentType === "EINVOICE") {
    return {
      canCancel: false,
      reason:
        "e-Fatura tek taraflı iptal edilemez. Düzeltme için iade faturası gerekir.",
    };
  }
  if (invoice.documentType !== "EARCHIVE") {
    return {
      canCancel: false,
      reason: "Yalnızca kesilmiş e-Arşiv faturaları iptal edilebilir.",
    };
  }
  if (invoice.docStatus === "CANCELLED") {
    return { canCancel: false, reason: "Bu fatura zaten iptal edilmiş." };
  }
  if (invoice.docStatus !== "COMPLETED" && invoice.docStatus !== "SENT") {
    return {
      canCancel: false,
      reason: "Yalnızca başarıyla kesilmiş e-Arşiv iptal edilebilir.",
    };
  }
  if (!invoice.uuid?.trim()) {
    return { canCancel: false, reason: "Fatura UUID’si yok; entegratöre gidemez." };
  }

  const created =
    typeof invoice.createdAt === "string"
      ? new Date(invoice.createdAt)
      : invoice.createdAt;
  if (Number.isNaN(created.getTime())) {
    return { canCancel: false, reason: "Fatura tarihi okunamadı." };
  }

  const deadline = new Date(created);
  deadline.setUTCDate(deadline.getUTCDate() + EARCHIVE_CANCEL_WINDOW_DAYS);
  if (Date.now() > deadline.getTime()) {
    return {
      canCancel: false,
      reason: `e-Arşiv iptal süresi doldu (${EARCHIVE_CANCEL_WINDOW_DAYS} gün). İade faturası gerekir.`,
    };
  }

  return {
    canCancel: true,
    reason: `e-Arşiv iptal edilebilir (${EARCHIVE_CANCEL_WINDOW_DAYS} gün içinde).`,
  };
}
