/**
 * Fatura UBL Note alanı — kullanıcı notu + banka / ödeme bilgisi.
 */

/** Metinden TR IBAN yakala (boşluklar yok sayılır). */
export function extractIbanFromText(
  text: string | null | undefined,
): string | null {
  if (!text?.trim()) return null;
  const compact = text.replace(/\s+/g, "");
  const m = compact.match(/TR\d{24}/i);
  return m ? m[0]!.toUpperCase() : null;
}

export function buildInvoiceDocumentNote(
  userNote: string | null | undefined,
  bankAccountInfo: string | null | undefined,
  opts?: { isPublicEntity?: boolean },
): string {
  const base = userNote?.trim() || "SmartStok konsinye faturalandırma";
  const bank = bankAccountInfo?.trim();
  const parts: string[] = [base];

  if (opts?.isPublicEntity) {
    parts.push(
      "Ödeme kanalı: Banka havalesi / EFT (Kamu faturası — GİB KAMUFATURASI).",
    );
  }

  if (bank) {
    if (!base.includes(bank) && !parts.some((p) => p.includes(bank))) {
      parts.push(`Banka Hesap Bilgileri:\n${bank}`);
    }
  } else if (opts?.isPublicEntity) {
    parts.push(
      "Uyarı: Firma banka/IBAN bilgisi tanımlı değil (Admin → Fatura Bilgileri).",
    );
  }

  return parts.join("\n\n");
}
