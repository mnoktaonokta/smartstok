import "server-only";

import { getOrCreateCompanySettings } from "@/lib/services/erp/company-settings";

export type LicenseStatus = {
  valid: boolean;
  licenseEndDate: Date | null;
};

/** Lisans süresi dolmuş mu? (şimdi > licenseEndDate) */
export async function getLicenseStatus(): Promise<LicenseStatus> {
  try {
    const settings = await getOrCreateCompanySettings();
    const end = settings.licenseEndDate;
    if (!end) {
      return { valid: false, licenseEndDate: null };
    }
    return {
      valid: end.getTime() >= Date.now(),
      licenseEndDate: end,
    };
  } catch {
    // Tablo yok / DB hatası — güvenli tarafta kilitleme (geliştirme bozulmasın diye geçerli say)
    return { valid: true, licenseEndDate: null };
  }
}
