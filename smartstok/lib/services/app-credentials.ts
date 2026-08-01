import "server-only";

import { getOrCreateCompanySettings } from "@/lib/services/erp/company-settings";

const DEFAULT_UTS_API_URL = "https://utsuygulama.saglik.gov.tr/rest";

/** AI key: CompanySettings → env */
export async function resolveAiApiKey(): Promise<string> {
  try {
    const s = await getOrCreateCompanySettings();
    const fromDb = s.aiApiKey?.trim();
    if (fromDb) return fromDb;
  } catch {
    /* tablo henüz yoksa env */
  }
  return (
    process.env.AI_API_KEY?.trim() ||
    process.env.OPENAI_API_KEY?.trim() ||
    ""
  );
}

/** ÜTS: CompanySettings → env */
export async function resolveUtsCredentials(): Promise<{
  token: string;
  firmNo: string;
  apiUrl: string;
}> {
  let token = "";
  let firmNo = "";
  try {
    const s = await getOrCreateCompanySettings();
    token = s.utsToken?.trim() || "";
    firmNo = s.utsFirmNo?.trim() || "";
  } catch {
    /* ignore */
  }
  if (!token) token = process.env.UTS_TOKEN?.trim() || "";
  if (!firmNo) firmNo = process.env.UTS_FIRM_NO?.trim() || "";

  const apiUrl = (
    process.env.UTS_API_URL?.trim() ||
    process.env.UTS_BASE_URL?.trim() ||
    DEFAULT_UTS_API_URL
  ).replace(/\/$/, "");

  return { token, firmNo, apiUrl };
}
