import "server-only";

import type { IErpProvider } from "./IErpProvider";
import { BizimHesapAdapter } from "./BizimHesapAdapter";
import { LogoAdapter } from "./LogoAdapter";
import { ParasutAdapter } from "./ParasutAdapter";
import { getOrCreateCompanySettings } from "./company-settings";

const DEFAULT_B2B_KEY = "BZMHB2B724018943908D0B82491F203F";

/**
 * CompanySettings.erpProvider’a göre doğru ERP adapter’ını üretir.
 */
export class ErpFactory {
  static async getInstance(): Promise<IErpProvider> {
    const s = await getOrCreateCompanySettings();

    switch (s.erpProvider) {
      case "PARASUT":
        return new ParasutAdapter({
          companyId: s.parasutCompanyId?.trim() || "",
          clientId: s.parasutClientId?.trim() || "",
          clientSecret: s.parasutClientSecret?.trim() || "",
          username: s.parasutUsername?.trim() || "",
          password: s.parasutPassword?.trim() || "",
        });
      case "ELOGO":
        return new LogoAdapter({
          firmNo: s.logoFirmNo?.trim() || "",
          apiKey: s.logoApiKey?.trim() || "",
          username: s.logoUsername?.trim() || "",
          password: s.logoPassword?.trim() || "",
        });
      case "BIZIMHESAP":
      default:
        return new BizimHesapAdapter({
          firmId:
            s.bhFirmId?.trim() ||
            process.env.BIZIMHESAP_FIRM_ID?.trim() ||
            "",
          token:
            s.bhToken?.trim() || process.env.BIZIMHESAP_TOKEN?.trim() || "",
          apiKey:
            s.bhApiKey?.trim() ||
            process.env.BIZIMHESAP_API_KEY?.trim() ||
            DEFAULT_B2B_KEY,
        });
    }
  }
}
