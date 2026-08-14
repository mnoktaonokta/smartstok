import "server-only";

import { getOrCreateCompanySettings } from "@/lib/services/erp/company-settings";
import { ELogoDocumentAdapter } from "./ELogoDocumentAdapter";
import type { IDocumentProvider } from "./IDocumentProvider";
import { QnbEsolutionsAdapter } from "./QnbEsolutionsAdapter";
import {
  resolveElogoCredentials,
  resolveQnbCredentials,
} from "./credentials";

export class EDocumentFactory {
  static async getInstance(): Promise<
    { ok: true; provider: IDocumentProvider } | { ok: false; error: string }
  > {
    const settings = await getOrCreateCompanySettings();
    if (settings.eDocumentProvider === "ELOGO") {
      const resolved = resolveElogoCredentials(settings);
      if (!resolved.ok) return resolved;
      return { ok: true, provider: new ELogoDocumentAdapter(resolved.creds) };
    }

    const resolved = resolveQnbCredentials(settings);
    if (!resolved.ok) return resolved;
    return { ok: true, provider: new QnbEsolutionsAdapter(resolved.creds) };
  }
}
