/**
 * Fatura UBL Note alanı — kullanıcı notu + Admin’deki banka bilgisi.
 * Görsel XSLT “Genel Açıklamalar”da cbc:Note satırlarını basar.
 */

const LEGACY_DEFAULT_NOTE = "SmartStok konsinye faturalandırma";

/** Metinden TR IBAN yakala (boşluklar yok sayılır). */
export function extractIbanFromText(
  text: string | null | undefined,
): string | null {
  if (!text?.trim()) return null;
  const compact = text.replace(/\s+/g, "");
  const m = compact.match(/TR\d{24}/i);
  return m ? m[0]!.toUpperCase() : null;
}

function stripLegacyAndBank(userNote: string, bank: string): string {
  let user = userNote.trim();
  if (bank && user.includes(bank)) {
    user = user.replace(bank, "");
  }
  return user
    .replace(new RegExp(LEGACY_DEFAULT_NOTE, "gi"), "")
    .replace(/Banka Hesap Bilgileri:\s*/gi, "")
    .trim();
}

export function buildInvoiceDocumentNote(
  userNote: string | null | undefined,
  bankAccountInfo: string | null | undefined,
  opts?: { isPublicEntity?: boolean },
): string {
  const bank = bankAccountInfo?.trim() ?? "";
  const user = stripLegacyAndBank(userNote ?? "", bank);
  const parts: string[] = [];

  if (user) parts.push(user);

  if (opts?.isPublicEntity) {
    parts.push(
      "Ödeme kanalı: Banka havalesi / EFT (Kamu faturası — GİB KAMUFATURASI).",
    );
  }

  if (bank) {
    parts.push(bank);
  } else if (opts?.isPublicEntity) {
    parts.push(
      "Uyarı: Firma banka/IBAN bilgisi tanımlı değil (Admin → Fatura Bilgileri).",
    );
  }

  return parts.join("\n");
}
