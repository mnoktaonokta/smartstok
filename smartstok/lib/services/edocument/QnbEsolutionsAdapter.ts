import "server-only";

import type { IDocumentProvider } from "./IDocumentProvider";
import type {
  CancelEArchiveResult,
  DespatchSendResult,
  DownloadOutgoingResult,
  EArchiveSendResult,
  EInvoiceSendResult,
  IncomingInvoice,
  IncomingResponseResult,
  ListIncomingResult,
  OutgoingStatusResult,
  QnbCredentials,
  TaxpayerQueryResult,
} from "./types";
import {
  buildSoapEnvelope,
  connectorWsdlToUserServiceEndpoint,
  escapeXml,
  extractSoapFault,
  postSoap,
  qnbWsLogin,
  summarizeHttpError,
  wsdlToEndpoint,
  xmlTagValue,
} from "./soap";
import { mapAppRespResult, mockIncomingInvoices } from "./incoming-invoice";

const MINIMAL_PDF_B64 =
  "JVBERi0xLjAKJeLjz9MKMSAwIG9iaiA8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFI+PgplbmRvYmoKMiAwIG9iaiA8PC9UeXBlL1BhZ2VzL0NvdW50IDEvS2lkc1szIDAgUl0+PgplbmRvYmoKMyAwIG9iaiA8PC9UeXBlL1BhZ2UvTWVkaWFCb3hbMCAwIDYxMiA3OTJdPj4KZW5kb2JqCnhyZWYKMCA0CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAxNSAwMDAwMCBuIAowMDAwMDAwMDc0IDAwMDAwIG4gCjAwMDAwMDAxMjEgMDAwMDAgbiAKdHJhaWxlcgo8PC9TaXplIDQvUm9vdCAxIDAgUj4+CnN0YXJ0eHJlZgoxOTMKJSVFT0Y=";

export class QnbEsolutionsAdapter implements IDocumentProvider {
  private sessionCookie: string | null = null;
  private loginAttempted = false;

  constructor(private readonly creds: QnbCredentials) {}

  private get mockMode() {
    return !this.creds.live;
  }

  /** Cookie (wsLogin) dene; olmazsa WS-Security ile devam. */
  private async ensureAuth(): Promise<{ cookie?: string; omitSecurity: boolean }> {
    if (this.sessionCookie) {
      return { cookie: this.sessionCookie, omitSecurity: true };
    }
    if (this.loginAttempted) {
      return { omitSecurity: false };
    }
    this.loginAttempted = true;
    const userEp = connectorWsdlToUserServiceEndpoint(this.creds.connectorWsdl);
    const login = await qnbWsLogin({
      userServiceEndpoint: userEp,
      username: this.creds.username,
      password: this.creds.password,
    });
    if (login.ok) {
      this.sessionCookie = login.cookie;
      return { cookie: login.cookie, omitSecurity: true };
    }
    // Cookie login başarısız → UsernameToken ile dene
    return { omitSecurity: false };
  }

  private async soapCall(opts: {
    endpoint: string;
    soapAction: string;
    bodyXml: string;
  }) {
    const auth = await this.ensureAuth();
    const envelope = buildSoapEnvelope({
      username: this.creds.username,
      password: this.creds.password,
      bodyXml: opts.bodyXml,
      omitSecurity: auth.omitSecurity,
    });
    return postSoap({
      endpoint: opts.endpoint,
      soapAction: opts.soapAction,
      envelope,
      cookie: auth.cookie,
    });
  }

  async queryTaxpayer(vknTckn: string): Promise<TaxpayerQueryResult> {
    if (this.mockMode) {
      const digits = vknTckn.replace(/\D/g, "");
      return {
        ok: true,
        isEInvoiceUser: digits.length === 10,
        alias: digits.length === 10 ? "urn:mail:defaultgk@efatura.gov.tr" : null,
        registrationDate: null,
      };
    }

    try {
      const endpoint = wsdlToEndpoint(this.creds.connectorWsdl);
      const body = `<ser:efaturaKullaniciBilgisi>
  <vergiTcKimlikNo>${escapeXml(vknTckn.replace(/\D/g, ""))}</vergiTcKimlikNo>
</ser:efaturaKullaniciBilgisi>`;

      let res = await this.soapCall({
        endpoint,
        soapAction: "efaturaKullaniciBilgisi",
        bodyXml: body,
      });

      // Cookie ile 500/401 olduysa UsernameToken ile bir kez daha dene
      if (!res.ok && this.sessionCookie) {
        this.sessionCookie = null;
        const envelope = buildSoapEnvelope({
          username: this.creds.username,
          password: this.creds.password,
          bodyXml: body,
          omitSecurity: false,
        });
        res = await postSoap({
          endpoint,
          soapAction: "efaturaKullaniciBilgisi",
          envelope,
        });
      }

      if (!res.ok) {
        return {
          ok: false,
          error: `QNB mükellef sorgu — ${summarizeHttpError(res.status, res.body)}`,
        };
      }
      const fault = extractSoapFault(res.body);
      if (fault) return { ok: false, error: fault };

      const kayitli =
        xmlTagValue(res.body, "kayitliKullaniciMi") ??
        xmlTagValue(res.body, "efaturaKullanicisi") ??
        xmlTagValue(res.body, "return");
      const isEInvoiceUser =
        kayitli === "true" ||
        kayitli === "1" ||
        (kayitli?.toLowerCase().includes("true") ?? false) ||
        Boolean(xmlTagValue(res.body, "etiket"));

      return {
        ok: true,
        isEInvoiceUser,
        alias: xmlTagValue(res.body, "etiket"),
        registrationDate: xmlTagValue(res.body, "kayitZamani"),
        raw: res.body,
      };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Mükellef sorgu hatası",
      };
    }
  }

  async sendEArchive(input: {
    ublXml: string;
    uuid: string;
    donenBelgeFormati?: number;
    taslagaYonlendir?: number;
  }): Promise<EArchiveSendResult> {
    if (this.mockMode) {
      return {
        ok: true,
        uuid: input.uuid,
        faturaNo: `EA${Date.now().toString().slice(-10)}`,
        faturaURL: null,
        pdfBase64: MINIMAL_PDF_B64,
      };
    }

    try {
      const format = input.donenBelgeFormati ?? 3;
      const draft = input.taslagaYonlendir ?? 0;
      const body = `<ser:faturaOlusturExt>
  <input>
    <vkn>${escapeXml(this.creds.vkn)}</vkn>
    <sube>DFLT</sube>
    <kasa>DFLT</kasa>
    <donenBelgeFormati>${format}</donenBelgeFormati>
    <erpKodu>${escapeXml(this.creds.erpKodu)}</erpKodu>
    <taslagaYonlendir>${draft}</taslagaYonlendir>
    <belge>
      <belgeFormati>UBL</belgeFormati>
      <belgeIcerigi><![CDATA[${input.ublXml}]]></belgeIcerigi>
    </belge>
  </input>
</ser:faturaOlusturExt>`;
      const envelope = buildSoapEnvelope({
        username: this.creds.username,
        password: this.creds.password,
        bodyXml: body,
      });
      const endpoint = wsdlToEndpoint(this.creds.earchiveWsdl);
      const res = await postSoap({
        endpoint,
        soapAction: "faturaOlusturExt",
        envelope,
      });
      if (!res.ok) {
        return { ok: false, error: `QNB e-Arşiv HTTP ${res.status}`, raw: res.body };
      }
      const fault = xmlTagValue(res.body, "faultstring");
      if (fault) return { ok: false, error: fault, raw: res.body };

      const resultCode =
        xmlTagValue(res.body, "resultCode") ??
        xmlTagValue(res.body, "sonucKodu");
      if (resultCode && resultCode !== "0" && resultCode !== "00") {
        const msg =
          xmlTagValue(res.body, "resultMsg") ??
          xmlTagValue(res.body, "sonucMesaji") ??
          "e-Arşiv red";
        return { ok: false, error: msg, raw: res.body };
      }

      return {
        ok: true,
        uuid:
          xmlTagValue(res.body, "uuid") ??
          xmlTagValue(res.body, "ettn") ??
          input.uuid,
        faturaNo:
          xmlTagValue(res.body, "faturaNo") ??
          xmlTagValue(res.body, "belgeNo"),
        faturaURL: xmlTagValue(res.body, "faturaURL"),
        pdfBase64:
          xmlTagValue(res.body, "belgeIcerigi") ??
          xmlTagValue(res.body, "pdf") ??
          xmlTagValue(res.body, "binaryData"),
        raw: res.body,
      };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "e-Arşiv gönderim hatası",
      };
    }
  }

  async sendEInvoice(input: {
    ublXml: string;
    uuid: string;
    belgeTuru?: string;
    alias?: string | null;
  }): Promise<EInvoiceSendResult> {
    if (this.mockMode) {
      return {
        ok: true,
        belgeOid: `MOCK-OID-${input.uuid.slice(0, 8)}`,
        uuid: input.uuid,
      };
    }

    try {
      const belgeTuru = input.belgeTuru ?? "FATURA";
      const body = `<ser:belgeGonderExt>
  <input>
    <vkn>${escapeXml(this.creds.vkn)}</vkn>
    <belgeTuru>${escapeXml(belgeTuru)}</belgeTuru>
    <belgeNo>${escapeXml(input.uuid)}</belgeNo>
    <veri><![CDATA[${input.ublXml}]]></veri>
    <belgeHash></belgeHash>
    <mimeType>application/xml</mimeType>
    <belgeVersiyon>1.0</belgeVersiyon>
    <erpKodu>${escapeXml(this.creds.erpKodu)}</erpKodu>
  </input>
</ser:belgeGonderExt>`;
      const envelope = buildSoapEnvelope({
        username: this.creds.username,
        password: this.creds.password,
        bodyXml: body,
      });
      const endpoint = wsdlToEndpoint(this.creds.connectorWsdl);
      const res = await postSoap({
        endpoint,
        soapAction: "belgeGonderExt",
        envelope,
      });
      if (!res.ok) {
        return { ok: false, error: `QNB e-Fatura HTTP ${res.status}`, raw: res.body };
      }
      const fault = xmlTagValue(res.body, "faultstring");
      if (fault) return { ok: false, error: fault, raw: res.body };

      const belgeOid =
        xmlTagValue(res.body, "belgeOid") ?? xmlTagValue(res.body, "return");
      if (!belgeOid) {
        return { ok: false, error: "belgeOid dönmedi", raw: res.body };
      }
      return { ok: true, belgeOid, uuid: input.uuid, raw: res.body };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "e-Fatura gönderim hatası",
      };
    }
  }

  async sendDespatch(_input: {
    ublXml: string;
    uuid: string;
    alias?: string | null;
  }): Promise<DespatchSendResult> {
    return {
      ok: false,
      error:
        "e-İrsaliye yalnızca e-Logo sağlayıcısı ile desteklenir. Admin → Firma Bilgileri’nden e-Logo seçin.",
    };
  }

  async getOutgoingStatus(
    belgeOid: string,
    _options?: import("./types").EDocumentRefOptions,
  ): Promise<OutgoingStatusResult> {
    if (this.mockMode) {
      return {
        ok: true,
        status: "COMPLETED",
        message: "Mock: işlendi",
        faturaNo: `EF${Date.now().toString().slice(-10)}`,
        faturaURL: null,
        pdfBase64: MINIMAL_PDF_B64,
      };
    }

    try {
      const body = `<ser:gidenBelgeDurumSorgulaExt>
  <vkn>${escapeXml(this.creds.vkn)}</vkn>
  <belgeOid>${escapeXml(belgeOid)}</belgeOid>
</ser:gidenBelgeDurumSorgulaExt>`;
      const envelope = buildSoapEnvelope({
        username: this.creds.username,
        password: this.creds.password,
        bodyXml: body,
      });
      const endpoint = wsdlToEndpoint(this.creds.connectorWsdl);
      const res = await postSoap({
        endpoint,
        soapAction: "gidenBelgeDurumSorgulaExt",
        envelope,
      });
      if (!res.ok) {
        return { ok: false, error: `Durum sorgu HTTP ${res.status}`, raw: res.body };
      }
      const fault = xmlTagValue(res.body, "faultstring");
      if (fault) return { ok: false, error: fault, raw: res.body };

      const durumKodu =
        xmlTagValue(res.body, "durum") ??
        xmlTagValue(res.body, "durumKodu") ??
        xmlTagValue(res.body, "code") ??
        "";
      const msg =
        xmlTagValue(res.body, "aciklama") ??
        xmlTagValue(res.body, "durumAciklama") ??
        null;

      let status: "PROCESSING" | "COMPLETED" | "FAILED" = "PROCESSING";
      const lower = durumKodu.toLowerCase();
      if (
        lower.includes("basari") ||
        lower === "2" ||
        lower === "30" ||
        lower.includes("tamam") ||
        lower.includes("succeed")
      ) {
        status = "COMPLETED";
      } else if (
        lower.includes("hata") ||
        lower.includes("error") ||
        lower.includes("fail") ||
        lower === "-1"
      ) {
        status = "FAILED";
      }

      return {
        ok: true,
        status,
        message: msg,
        faturaNo: xmlTagValue(res.body, "faturaNo"),
        faturaURL: xmlTagValue(res.body, "belgeLink") ?? xmlTagValue(res.body, "faturaURL"),
        pdfBase64: xmlTagValue(res.body, "belgeIcerigi"),
        raw: res.body,
      };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Durum sorgu hatası",
      };
    }
  }

  async downloadOutgoing(
    belgeOid: string,
    _options?: import("./types").EDocumentRefOptions,
  ): Promise<DownloadOutgoingResult> {
    if (this.mockMode) {
      return { ok: true, pdfBase64: MINIMAL_PDF_B64, faturaURL: null };
    }
    try {
      const body = `<ser:gidenBelgeIndir>
  <vkn>${escapeXml(this.creds.vkn)}</vkn>
  <belgeOid>${escapeXml(belgeOid)}</belgeOid>
  <belgeFormati>PDF</belgeFormati>
</ser:gidenBelgeIndir>`;
      const envelope = buildSoapEnvelope({
        username: this.creds.username,
        password: this.creds.password,
        bodyXml: body,
      });
      const endpoint = wsdlToEndpoint(this.creds.connectorWsdl);
      const res = await postSoap({
        endpoint,
        soapAction: "gidenBelgeIndir",
        envelope,
      });
      if (!res.ok) {
        return { ok: false, error: `İndirme HTTP ${res.status}` };
      }
      return {
        ok: true,
        pdfBase64:
          xmlTagValue(res.body, "return") ??
          xmlTagValue(res.body, "belgeIcerigi"),
        faturaURL: xmlTagValue(res.body, "faturaURL"),
        raw: res.body,
      };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "İndirme hatası",
      };
    }
  }

  async cancelEArchive(input: {
    uuid: string;
    faturaNo?: string | null;
    vknTckn?: string | null;
  }): Promise<CancelEArchiveResult> {
    if (this.mockMode) {
      return { ok: true };
    }

    const uuid = input.uuid.trim();
    if (!uuid) return { ok: false, error: "İptal için UUID gerekli." };

    try {
      const ettn = escapeXml(uuid);
      const faturaNo = (input.faturaNo ?? "").trim();
      const body = `<ser:faturaIptal>
  <ettn>${ettn}</ettn>
  <faturaUuid>${ettn}</faturaUuid>
  ${faturaNo ? `<faturaNo>${escapeXml(faturaNo)}</faturaNo>` : ""}
</ser:faturaIptal>`;
      const envelope = buildSoapEnvelope({
        username: this.creds.username,
        password: this.creds.password,
        bodyXml: body,
      });
      const endpoint = wsdlToEndpoint(this.creds.earchiveWsdl);
      const res = await postSoap({
        endpoint,
        soapAction: "faturaIptal",
        envelope,
      });
      if (!res.ok) {
        return {
          ok: false,
          error: `QNB e-Arşiv iptal HTTP ${res.status}`,
          raw: res.body,
        };
      }
      const fault = extractSoapFault(res.body) || xmlTagValue(res.body, "faultstring");
      if (fault) return { ok: false, error: fault, raw: res.body };

      const resultCode =
        xmlTagValue(res.body, "resultCode") ??
        xmlTagValue(res.body, "sonucKodu");
      if (resultCode && resultCode !== "0" && resultCode !== "00") {
        const msg =
          xmlTagValue(res.body, "resultMsg") ??
          xmlTagValue(res.body, "sonucMesaji") ??
          "e-Arşiv iptal reddedildi.";
        return { ok: false, error: msg, raw: res.body };
      }

      return { ok: true, raw: res.body };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "e-Arşiv iptal hatası",
      };
    }
  }

  async listIncomingInvoices(input: {
    from: string;
    to: string;
  }): Promise<ListIncomingResult> {
    if (this.mockMode) {
      return { ok: true, invoices: mockIncomingInvoices() };
    }

    const endpoint = wsdlToEndpoint(this.creds.connectorWsdl);
    const vkn = escapeXml(this.creds.vkn);
    const attempts: Array<{ action: string; body: string }> = [
      {
        action: "gelenBelgeleriListeleExt",
        body: `<ser:gelenBelgeleriListeleExt>
  <parametreler>
    <vergiTcKimlikNo>${vkn}</vergiTcKimlikNo>
    <belgeTuru>FATURA</belgeTuru>
    <baslangicTarihi>${escapeXml(input.from)}</baslangicTarihi>
    <bitisTarihi>${escapeXml(input.to)}</bitisTarihi>
  </parametreler>
</ser:gelenBelgeleriListeleExt>`,
      },
      {
        action: "gelenBelgeleriListele",
        body: `<ser:gelenBelgeleriListele>
  <vergiTcKimlikNo>${vkn}</vergiTcKimlikNo>
  <belgeTuru>FATURA</belgeTuru>
  <baslangicTarihi>${escapeXml(input.from)}</baslangicTarihi>
  <bitisTarihi>${escapeXml(input.to)}</bitisTarihi>
</ser:gelenBelgeleriListele>`,
      },
    ];

    let lastError = "Gelen fatura listesi alınamadı.";
    try {
      for (const attempt of attempts) {
        const envelope = buildSoapEnvelope({
          username: this.creds.username,
          password: this.creds.password,
          bodyXml: attempt.body,
        });
        const res = await postSoap({
          endpoint,
          soapAction: attempt.action,
          envelope,
        });
        const fault =
          extractSoapFault(res.body) || xmlTagValue(res.body, "faultstring");
        if (fault) {
          lastError = fault;
          if (!/bulunamad|yok|not found|tanımsız|undefined/i.test(fault)) {
            continue;
          }
          continue;
        }
        if (!res.ok) {
          lastError = `QNB gelen liste HTTP ${res.status}`;
          continue;
        }
        return { ok: true, invoices: parseQnbIncomingDocuments(res.body) };
      }
      return { ok: false, error: lastError };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Gelen fatura listesi alınamadı.",
      };
    }
  }

  async downloadIncoming(uuid: string): Promise<DownloadOutgoingResult> {
    if (this.mockMode) {
      return { ok: true, pdfBase64: MINIMAL_PDF_B64, faturaURL: null };
    }
    const endpoint = wsdlToEndpoint(this.creds.connectorWsdl);
    const vkn = escapeXml(this.creds.vkn);
    const ettn = escapeXml(uuid);
    const attempts: Array<{ action: string; body: string }> = [
      {
        action: "gelenBelgeIndir",
        body: `<ser:gelenBelgeIndir>
  <vkn>${vkn}</vkn>
  <ettn>${ettn}</ettn>
  <belgeFormati>PDF</belgeFormati>
</ser:gelenBelgeIndir>`,
      },
      {
        action: "gidenBelgeIndir",
        body: `<ser:gidenBelgeIndir>
  <vkn>${vkn}</vkn>
  <belgeOid>${ettn}</belgeOid>
  <belgeFormati>PDF</belgeFormati>
</ser:gidenBelgeIndir>`,
      },
    ];
    let lastError = "PDF alınamadı.";
    try {
      for (const attempt of attempts) {
        const envelope = buildSoapEnvelope({
          username: this.creds.username,
          password: this.creds.password,
          bodyXml: attempt.body,
        });
        const res = await postSoap({
          endpoint,
          soapAction: attempt.action,
          envelope,
        });
        if (!res.ok) {
          lastError = `QNB PDF HTTP ${res.status}`;
          continue;
        }
        const fault =
          extractSoapFault(res.body) || xmlTagValue(res.body, "faultstring");
        if (fault) {
          lastError = fault;
          continue;
        }
        const pdfBase64 =
          xmlTagValue(res.body, "return") ??
          xmlTagValue(res.body, "belgeIcerigi") ??
          xmlTagValue(res.body, "pdf");
        if (!pdfBase64) {
          lastError = "PDF verisi dönmedi.";
          continue;
        }
        return { ok: true, pdfBase64, faturaURL: null, raw: res.body };
      }
      return { ok: false, error: lastError };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "PDF indirme hatası",
      };
    }
  }

  async sendIncomingResponse(input: {
    uuid: string;
    decision: "KABUL" | "RED";
    description: string;
    alias?: string | null;
  }): Promise<IncomingResponseResult> {
    if (this.mockMode) return { ok: true };

    const endpoint = wsdlToEndpoint(this.creds.connectorWsdl);
    const ettn = escapeXml(input.uuid.trim());
    const aciklama = escapeXml(input.description.trim() || input.decision);
    const body = `<ser:uygulamaYanitiGonder>
  <ettn>${ettn}</ettn>
  <durum>${input.decision}</durum>
  <yanit>${input.decision}</yanit>
  <aciklama>${aciklama}</aciklama>
</ser:uygulamaYanitiGonder>`;

    try {
      const envelope = buildSoapEnvelope({
        username: this.creds.username,
        password: this.creds.password,
        bodyXml: body,
      });
      const res = await postSoap({
        endpoint,
        soapAction: "uygulamaYanitiGonder",
        envelope,
      });
      if (!res.ok) {
        return { ok: false, error: `QNB uygulama yanıtı HTTP ${res.status}`, raw: res.body };
      }
      const fault =
        extractSoapFault(res.body) || xmlTagValue(res.body, "faultstring");
      if (fault) return { ok: false, error: fault, raw: res.body };
      return { ok: true, raw: res.body };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Uygulama yanıtı gönderilemedi.",
      };
    }
  }
}

function parseQnbIncomingDocuments(xml: string): IncomingInvoice[] {
  const blocks =
    xml.match(
      /<(?:[\w-]+:)?(?:belge|fatura|gelenBelge)\b[\s\S]*?<\/(?:[\w-]+:)?(?:belge|fatura|gelenBelge)>/gi,
    ) ?? [];
  const invoices: IncomingInvoice[] = [];
  const seen = new Set<string>();
  const source = blocks.length ? blocks : [xml];

  for (const block of source) {
    const uuid =
      xmlTagValue(block, "ettn") ??
      xmlTagValue(block, "uuid") ??
      xmlTagValue(block, "belgeOid") ??
      "";
    if (!uuid || seen.has(uuid)) continue;
    seen.add(uuid);
    invoices.push({
      uuid,
      invoiceNo:
        xmlTagValue(block, "belgeNo") ??
        xmlTagValue(block, "faturaNo") ??
        xmlTagValue(block, "invoiceId"),
      issueDate: (xmlTagValue(block, "belgeTarihi") ??
        xmlTagValue(block, "faturaTarihi") ??
        xmlTagValue(block, "issueDate") ??
        "").slice(0, 10) || null,
      receivedAt: (xmlTagValue(block, "alimTarihi") ??
        xmlTagValue(block, "gelisTarihi") ??
        "").slice(0, 10) || null,
      supplierName:
        xmlTagValue(block, "gonderenUnvan") ??
        xmlTagValue(block, "unvan") ??
        xmlTagValue(block, "supplierName"),
      supplierVkn:
        xmlTagValue(block, "gonderenVkn") ??
        xmlTagValue(block, "vergiTcKimlikNo") ??
        xmlTagValue(block, "vkn"),
      payableAmount:
        xmlTagValue(block, "odenecekTutar") ??
        xmlTagValue(block, "tutar") ??
        xmlTagValue(block, "payableAmount"),
      currency: xmlTagValue(block, "paraBirimi") ?? "TRY",
      profileId:
        xmlTagValue(block, "senaryo") ??
        xmlTagValue(block, "profileId") ??
        xmlTagValue(block, "faturaSenaryo"),
      appStatus: mapAppRespResult(
        xmlTagValue(block, "yanitDurumu") ??
          xmlTagValue(block, "uygulamaYaniti") ??
          xmlTagValue(block, "durum"),
      ),
      gbAlias: xmlTagValue(block, "gonderenEtiket") ?? xmlTagValue(block, "alias"),
    });
  }
  return invoices;
}
