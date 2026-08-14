import "server-only";

import type { CompanySettings } from "@/app/generated/prisma/client";
import type { ElogoCredentials, QnbCredentials } from "./types";

/** e-Logo PostBoxService */
const ELOGO_TEST_ENDPOINT =
  "https://pb-demo.elogo.com.tr/PostBoxService.svc";
const ELOGO_LIVE_ENDPOINT = "https://pb.elogo.com.tr/PostBoxService.svc";

/** QNB connector (e-Fatura mükellef sorgu / belge gönder) */
const TEST_CONNECTOR =
  "https://connectortest.efinans.com.tr/connector/ws/connectorService?wsdl";
const LIVE_CONNECTOR =
  "https://connector.efinans.com.tr/connector/ws/connectorService?wsdl";

/** e-Arşiv */
const TEST_EARCHIVE =
  "https://earsivtest.efinans.com.tr/earsiv/ws/EarsivWebService?wsdl";
const LIVE_EARCHIVE =
  "https://earsiv.efinans.com.tr/earsiv/ws/EarsivWebService?wsdl";

/**
 * Gerçek SOAP için: kullanıcı + şifre + VKN yeterli.
 * erpKodu opsiyonel. Ortam TEST/LIVE → ilgili WSDL.
 * Credential eksikse → mock. QNB_FORCE_MOCK=1 → her zaman mock.
 * WSDL override: QNB_CONNECTOR_WSDL / QNB_EARCHIVE_WSDL
 */
export function resolveQnbCredentials(
  settings: CompanySettings,
): { ok: true; creds: QnbCredentials } | { ok: false; error: string } {
  const username =
    settings.qnbUsername?.trim() || process.env.QNB_USERNAME?.trim() || "";
  const password =
    settings.qnbPassword?.trim() || process.env.QNB_PASSWORD?.trim() || "";
  const vkn =
    settings.qnbVkn?.trim() ||
    settings.vkn?.trim() ||
    process.env.QNB_VKN?.trim() ||
    "";
  const erpKodu =
    settings.qnbErpKodu?.trim() || process.env.QNB_ERP_KODU?.trim() || "";
  const envRaw = (
    settings.qnbEnvironment?.trim() ||
    process.env.QNB_ENVIRONMENT?.trim() ||
    "TEST"
  ).toUpperCase();
  const environment: "TEST" | "LIVE" = envRaw === "LIVE" ? "LIVE" : "TEST";

  const forceMock =
    process.env.QNB_FORCE_MOCK === "1" ||
    process.env.QNB_FORCE_MOCK === "true";

  const hasCredentials = Boolean(username && password && vkn);
  const live = !forceMock && hasCredentials;

  const connectorWsdl =
    process.env.QNB_CONNECTOR_WSDL?.trim() ||
    (environment === "LIVE" ? LIVE_CONNECTOR : TEST_CONNECTOR);
  const earchiveWsdl =
    process.env.QNB_EARCHIVE_WSDL?.trim() ||
    (environment === "LIVE" ? LIVE_EARCHIVE : TEST_EARCHIVE);

  if (live) {
    if (!username || !password) {
      return {
        ok: false,
        error:
          "QNB kullanıcı adı / şifre eksik. Admin → Fatura Bilgileri’ni doldurun.",
      };
    }
    if (!vkn) {
      return {
        ok: false,
        error: "QNB VKN eksik (Firma VKN veya Fatura Bilgileri → QNB VKN).",
      };
    }
  }

  return {
    ok: true,
    creds: {
      username: username || "mock-user",
      password: password || "mock-pass",
      vkn: vkn || "0000000000",
      erpKodu,
      environment,
      connectorWsdl,
      earchiveWsdl,
      live,
    },
  };
}

/**
 * e-Logo PostBoxService.
 * Gerçek SOAP: kullanıcı kodu + şifre. Ortam TEST/LIVE → ilgili endpoint.
 * Credential eksikse → mock. ELOGO_FORCE_MOCK=1 → her zaman mock.
 * Override: ELOGO_ENDPOINT
 */
export function resolveElogoCredentials(
  settings: CompanySettings,
): { ok: true; creds: ElogoCredentials } | { ok: false; error: string } {
  const username =
    settings.elogoUsername?.trim() ||
    process.env.ELOGO_USERNAME?.trim() ||
    "";
  const password =
    settings.elogoPassword?.trim() ||
    process.env.ELOGO_PASSWORD?.trim() ||
    "";
  const envRaw = (
    settings.elogoEnvironment?.trim() ||
    process.env.ELOGO_ENVIRONMENT?.trim() ||
    "TEST"
  ).toUpperCase();
  const environment: "TEST" | "LIVE" = envRaw === "LIVE" ? "LIVE" : "TEST";

  const forceMock =
    process.env.ELOGO_FORCE_MOCK === "1" ||
    process.env.ELOGO_FORCE_MOCK === "true";

  const hasCredentials = Boolean(username && password);
  const live = !forceMock && hasCredentials;

  const endpoint =
    process.env.ELOGO_ENDPOINT?.trim() ||
    (environment === "LIVE" ? ELOGO_LIVE_ENDPOINT : ELOGO_TEST_ENDPOINT);

  if (live && (!username || !password)) {
    return {
      ok: false,
      error:
        "e-Logo kullanıcı kodu / şifre eksik. Admin → Fatura Bilgileri’ni doldurun.",
    };
  }

  return {
    ok: true,
    creds: {
      username: username || "mock-user",
      password: password || "mock-pass",
      environment,
      endpoint,
      live,
    },
  };
}
