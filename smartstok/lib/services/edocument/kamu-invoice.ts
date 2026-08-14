import type { UblInvoiceInput, UblParty } from "./types";
import {
  extractIbanFromText,
  buildInvoiceDocumentNote,
} from "./invoice-note";

/** e-Fatura ProfileID seçimi (kamu > tıbbi cihaz > e-arşiv). */
export function resolveInvoiceProfileId(opts: {
  isPublicEntity: boolean;
  isEInvoice: boolean;
}): UblInvoiceInput["profileId"] {
  if (opts.isPublicEntity) return "KAMUFATURASI";
  return opts.isEInvoice ? "ILAC_TIBBICIHAZ" : "EARSIVFATURA";
}

export type PublicEntityCustomer = {
  isPublicEntity: boolean;
  vknTckn: string;
  spendingUnitVkn: string | null;
  name: string;
  taxOffice: string | null;
  address: string | null;
  phone: string | null;
};

/**
 * Kamu faturası için UBL customer (muhasebe) + buyer (harcama birimi) + IBAN/note.
 * Hata varsa { error } döner.
 */
export function buildPublicEntityUblExtras(
  customer: PublicEntityCustomer,
  bankAccountInfo: string | null | undefined,
  userNote: string | null | undefined,
):
  | {
      ok: true;
      buyer: UblParty;
      paymentIban: string;
      note: string;
      profileId: "KAMUFATURASI";
    }
  | { ok: false; error: string } {
  if (!customer.isPublicEntity) {
    return { ok: false, error: "Müşteri kamu kurumu değil." };
  }
  const spending = (customer.spendingUnitVkn ?? "").replace(/\D/g, "");
  if (!/^\d{10}$/.test(spending)) {
    return {
      ok: false,
      error:
        "Kamu kurumu için Harcama Birimi VKN tanımlı değil. Müşteri kartını güncelleyin.",
    };
  }
  if (spending === customer.vknTckn.replace(/\D/g, "")) {
    return {
      ok: false,
      error: "Harcama Birimi VKN, ana (muhasebe) VKN’den farklı olmalıdır.",
    };
  }

  const bank = bankAccountInfo?.trim();
  if (!bank) {
    return {
      ok: false,
      error:
        "Kamu faturası için IBAN zorunlu. Admin → Fatura Bilgileri → Banka Hesap Bilgilerinize IBAN ekleyin.",
    };
  }
  const paymentIban = extractIbanFromText(bank);
  if (!paymentIban) {
    return {
      ok: false,
      error:
        "Banka hesap metninde geçerli bir TR IBAN bulunamadı. Fatura Bilgileri’ne IBAN yazın.",
    };
  }

  const buyer: UblParty = {
    vknTckn: spending,
    name: customer.name,
    taxOffice: customer.taxOffice,
    address: customer.address,
    phone: customer.phone,
  };

  return {
    ok: true,
    buyer,
    paymentIban,
    profileId: "KAMUFATURASI",
    note: buildInvoiceDocumentNote(userNote, bank, { isPublicEntity: true }),
  };
}
