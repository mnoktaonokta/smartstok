import "server-only";

import type { IDocumentProvider } from "./IDocumentProvider";
import type {
  CancelEArchiveResult,
  DespatchSendResult,
  DownloadOutgoingResult,
  EArchiveSendResult,
  EDocumentRefOptions,
  EInvoiceSendResult,
  ElogoCredentials,
  IncomingInvoice,
  IncomingResponseResult,
  ListIncomingResult,
  OutgoingStatusResult,
  TaxpayerQueryResult,
} from "./types";
import { mapAppRespResult, mockIncomingInvoices } from "./incoming-invoice";
import {
  escapeXml,
  extractSoapFault,
  summarizeHttpError,
  xmlTagValue,
} from "./soap";
import { ublToElogoZip, normalizeElogoPdfBase64 } from "./zip";

const NS_TEM = "http://tempuri.org/";
const NS_EFAT =
  "http://schemas.datacontract.org/2004/07/eFaturaWebService";
const NS_ARR = "http://schemas.microsoft.com/2003/10/Serialization/Arrays";

const MINIMAL_PDF_B64 =
  "JVBERi0xLjAKJeLjz9MKMSAwIG9iaiA8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFI+PgplbmRvYmoKMiAwIG9iaiA8PC9UeXBlL1BhZ2VzL0NvdW50IDEvS2lkc1szIDAgUl0+PgplbmRvYmoKMyAwIG9iaiA8PC9UeXBlL1BhZ2UvTWVkaWFCb3hbMCAwIDYxMiA3OTJdPj4KZW5kb2JqCnhyZWYKMCA0CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAxNSAwMDAwMCBuIAowMDAwMDAwMDc0IDAwMDAwIG4gCjAwMDAwMDAxMjEgMDAwMDAgbiAKdHJhaWxlcgo8PC9TaXplIDQvUm9vdCAxIDAgUj4+CnN0YXJ0eHJlZgoxOTMKJSVFT0Y=";

const FAILED_EINVOICE_CODES = new Set([
  -1, 21, 24, 26, 30, 33, 41, 43,
]);
const COMPLETED_EINVOICE_CODES = new Set([25, 32]);

function buildElogoEnvelope(bodyXml: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="${NS_TEM}" xmlns:efat="${NS_EFAT}" xmlns:arr="${NS_ARR}">
  <soapenv:Header/>
  <soapenv:Body>
${bodyXml}
  </soapenv:Body>
</soapenv:Envelope>`;
}

function paramListXml(params: string[]): string {
  if (params.length === 0) return "<tem:paramList/>";
  return `<tem:paramList>
${params.map((p) => `        <arr:string>${escapeXml(p)}</arr:string>`).join("\n")}
      </tem:paramList>`;
}

/** GetDocumentData için belge tipi denemeleri (yeni e-Arşiv TYPE2 / taslak). */
function documentTypeDownloadAttempts(documentType: string): string[] {
  if (documentType === "EARCHIVE") {
    return ["EARCHIVE", "EARCHIVETYPE2", "DRAFTEARCHIVE"];
  }
  if (documentType === "EINVOICE") {
    return ["EINVOICE", "DRAFTINVOICE"];
  }
  return [documentType];
}

async function postElogoSoap(opts: {
  endpoint: string;
  soapAction: string;
  envelope: string;
}): Promise<{ ok: boolean; status: number; body: string }> {
  try {
    const res = await fetch(opts.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: `"${opts.soapAction}"`,
      },
      body: opts.envelope,
      cache: "no-store",
    });
    const body = await res.text();
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    const parts = [`e-Logo’ya ulaşılamadı (${opts.endpoint})`];
    if (err instanceof Error) {
      parts.push(err.message);
      const cause = (err as Error & { cause?: unknown }).cause;
      if (cause instanceof Error) parts.push(cause.message);
    } else {
      parts.push(String(err));
    }
    throw new Error(parts.join(" — "));
  }
}

function resultCode(xml: string): string | null {
  return (
    xmlTagValue(xml, "a:resultCode") ??
    xmlTagValue(xml, "resultCode") ??
    xmlTagValue(xml, "ResultCode")
  );
}

function resultMsg(xml: string): string | null {
  return (
    xmlTagValue(xml, "a:resultMsg") ??
    xmlTagValue(xml, "resultMsg") ??
    xmlTagValue(xml, "ResultMsg")
  );
}

function firstTagAnywhere(xml: string, localName: string): string | null {
  // (?=[\s/>]) — Invoice, InvoicePkList gibi önek çakışmasını önler
  const re = new RegExp(
    `<(?:[\\w-]+:)?${localName}(?=[\\s/>])[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${localName}\\s*>`,
    "i",
  );
  const m = xml.match(re);
  if (!m?.[1]) return null;
  return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
}

function listPresence(xml: string, listLocalName: string): {
  tagPresent: boolean;
  nil: boolean;
  aliasCount: number;
  infoTypeCount: number;
  snippet: string;
} {
  const tagRe = new RegExp(`<(?:[\\w-]+:)?${listLocalName}(?=[\\s/>])`, "i");
  const tagPresent = tagRe.test(xml);
  const nil = new RegExp(
    `<(?:[\\w-]+:)?${listLocalName}(?=[\\s/>])[^>]*\\bi:nil\\s*=\\s*"true"`,
    "i",
  ).test(xml);
  const block = extractListBlock(xml, listLocalName);
  const aliases = aliasesInBlock(block);
  const infoTypeCount = block
    ? (block.match(/GibUserInfoType/gi) ?? []).length
    : 0;
  return {
    tagPresent,
    nil,
    aliasCount: aliases.length,
    infoTypeCount,
    snippet: (block ?? "").replace(/\s+/g, " ").trim().slice(0, 180),
  };
}

/** İlgili VKN için GibUserType bloğu */
function gibUserBlockForVkn(xml: string, vkn: string): string | null {
  const re =
    /<(?:[\w-]+:)?GibUserType\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?GibUserType>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const block = m[1] ?? "";
    const idMatch = block.match(
      /<(?:[\w-]+:)?Identifier\b[^>]*>([^<]+)<\/(?:[\w-]+:)?Identifier>/i,
    );
    const id = (idMatch?.[1] ?? "").replace(/\D/g, "");
    if (id === vkn) return block;
  }
  return null;
}

function extractListBlock(xml: string, listLocalName: string): string | null {
  const re = new RegExp(
    `<(?:[\\w-]+:)?${listLocalName}(?=[\\s/>])[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${listLocalName}\\s*>`,
    "i",
  );
  const m = xml.match(re);
  return m?.[1] ?? null;
}

function aliasesInBlock(block: string | null): string[] {
  if (!block) return [];
  const out: string[] = [];
  const re = /<(?:[\w-]+:)?Alias\b[^>]*>([^<]+)</gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) {
    const a = m[1]?.trim();
    if (a && !/^true$/i.test(a) && a.toLowerCase() !== "nil") out.push(a);
  }
  // Bazı yanıtlarda Alias etiketi boş, urn düz metin/CDATA olabilir
  const urns = block.match(/urn:mail:[^\s<"']+/gi) ?? [];
  for (const u of urns) {
    if (!out.includes(u)) out.push(u);
  }
  return out;
}

function allMailAliases(xml: string): string[] {
  const fromTags = aliasesInBlock(xml);
  const urns = xml.match(/urn:mail:[^\s<"']+/gi) ?? [];
  const set = new Set<string>([...fromTags, ...urns]);
  return [...set];
}

function isPkAlias(a: string): boolean {
  return /(?:^|[:.\/])[^@]*pk[^@]*@/i.test(a) || /posta.?kutusu/i.test(a);
}

function isGbAlias(a: string): boolean {
  return /(?:^|[:.\/])[^@]*gb[^@]*@/i.test(a);
}

/** Alıcı PK etiketi tercih edilir. */
function pickReceiverAlias(xml: string): string | null {
  const pkAliases = aliasesInBlock(extractListBlock(xml, "InvoicePkList"));
  if (pkAliases.length > 0) {
    return pkAliases.find(isPkAlias) || pkAliases[0] || null;
  }
  const all = allMailAliases(xml);
  const pks = all.filter(isPkAlias);
  if (pks.length > 0) return pks[0]!;
  // Listede yoksa ama tek urn varsa (nadiren) onu kullanma — GB'yi alıcı sanma
  return null;
}

function pickSenderAlias(xml: string): string | null {
  const gbAliases = aliasesInBlock(extractListBlock(xml, "InvoiceGbList"));
  if (gbAliases.length > 0) {
    return gbAliases.find(isGbAlias) || gbAliases[0] || null;
  }
  const all = allMailAliases(xml);
  const gbs = all.filter(isGbAlias);
  return gbs[0] || null;
}

function extractDocumentBinaryBase64(xml: string): string | null {
  // binaryData/Value — en içteki Value'yu tercih et
  const value =
    firstTagAnywhere(xml, "Value") ??
    firstTagAnywhere(xml, "binaryData") ??
    firstTagAnywhere(xml, "documentData");
  if (!value) return null;
  const cleaned = value.replace(/\s+/g, "");
  if (cleaned.length < 40) return null;
  return cleaned;
}

function mapElogoStatus(
  documentType: "EINVOICE" | "EARCHIVE" | "DESPATCHADVICE",
  statusRaw: string | null,
  codeRaw: string | null,
): "PROCESSING" | "COMPLETED" | "FAILED" {
  const status = Number(statusRaw ?? NaN);
  const code = Number(codeRaw ?? NaN);

  if (documentType === "EARCHIVE" || documentType === "DESPATCHADVICE") {
    if (status === 2) return "COMPLETED";
    if (status < 0 || status === 0) return "FAILED";
    return "PROCESSING";
  }

  if (!Number.isNaN(code)) {
    if (COMPLETED_EINVOICE_CODES.has(code)) return "COMPLETED";
    if (FAILED_EINVOICE_CODES.has(code)) return "FAILED";
  }
  if (!Number.isNaN(status)) {
    if (COMPLETED_EINVOICE_CODES.has(status)) return "COMPLETED";
    if (FAILED_EINVOICE_CODES.has(status)) return "FAILED";
    if (status === 2) return "COMPLETED";
  }
  return "PROCESSING";
}

export class ELogoDocumentAdapter implements IDocumentProvider {
  private sessionId: string | null = null;

  constructor(private readonly creds: ElogoCredentials) {}

  private get mockMode() {
    return !this.creds.live;
  }

  private soapAction(op: string) {
    return `http://tempuri.org/IPostBoxService/${op}`;
  }

  private async login(): Promise<{ ok: true; sessionID: string } | { ok: false; error: string }> {
    if (this.sessionId) return { ok: true, sessionID: this.sessionId };

    const body = `<tem:Login>
      <tem:login>
        <efat:appStr>SmartStok</efat:appStr>
        <efat:passWord>${escapeXml(this.creds.password)}</efat:passWord>
        <efat:source>ES</efat:source>
        <efat:userName>${escapeXml(this.creds.username)}</efat:userName>
        <efat:version>1.0</efat:version>
      </tem:login>
    </tem:Login>`;

    const res = await postElogoSoap({
      endpoint: this.creds.endpoint,
      soapAction: this.soapAction("Login"),
      envelope: buildElogoEnvelope(body),
    });

    const fault = extractSoapFault(res.body);
    if (fault) return { ok: false, error: fault };
    if (!res.ok) {
      return { ok: false, error: summarizeHttpError(res.status, res.body) };
    }

    const loginResult =
      xmlTagValue(res.body, "LoginResult") ??
      firstTagAnywhere(res.body, "LoginResult");
    const sessionID =
      xmlTagValue(res.body, "sessionID") ??
      firstTagAnywhere(res.body, "sessionID");

    if (
      (loginResult === "true" || loginResult === "1") &&
      sessionID &&
      sessionID.length > 8
    ) {
      this.sessionId = sessionID;
      return { ok: true, sessionID };
    }

    return {
      ok: false,
      error:
        resultMsg(res.body) ||
        "e-Logo Login başarısız (sessionID alınamadı).",
    };
  }

  private async withSession<T>(
    fn: (sessionID: string) => Promise<T>,
  ): Promise<T> {
    const first = await this.login();
    if (!first.ok) throw new Error(first.error);
    try {
      return await fn(first.sessionID);
    } catch (e) {
      // oturum düşmüş olabilir — bir kez yenile
      this.sessionId = null;
      const second = await this.login();
      if (!second.ok) throw new Error(second.error);
      return await fn(second.sessionID);
    }
  }

  async queryTaxpayer(vknTckn: string): Promise<TaxpayerQueryResult> {
    if (this.mockMode) {
      const digits = vknTckn.replace(/\D/g, "");
      return {
        ok: true,
        isEInvoiceUser: digits.length === 10,
        alias:
          digits.length === 10 ? "urn:mail:defaultpk@elogo.com.tr" : null,
        registrationDate: null,
      };
    }

    try {
      const digits = vknTckn.replace(/\D/g, "");
      return await this.withSession(async (sessionID) => {
        const body = `<tem:CheckGibUser>
      <tem:sessionID>${escapeXml(sessionID)}</tem:sessionID>
      <tem:vknTcknList>
        <arr:string>${escapeXml(digits)}</arr:string>
      </tem:vknTcknList>
    </tem:CheckGibUser>`;

        const res = await postElogoSoap({
          endpoint: this.creds.endpoint,
          soapAction: this.soapAction("CheckGibUser"),
          envelope: buildElogoEnvelope(body),
        });

        const fault = extractSoapFault(res.body);
        if (fault) return { ok: false, error: fault };
        if (!res.ok) {
          return {
            ok: false,
            error: `CheckGibUser — ${summarizeHttpError(res.status, res.body)}`,
          };
        }

        const code = resultCode(res.body);
        if (code && code !== "1") {
          return {
            ok: false,
            error: resultMsg(res.body) || `CheckGibUser resultCode=${code}`,
            raw: res.body,
          };
        }

        const userBlock = gibUserBlockForVkn(res.body, digits);
        const scopeXml = userBlock ?? res.body;
        const pkInfo = listPresence(scopeXml, "InvoicePkList");
        const gbInfo = listPresence(scopeXml, "InvoiceGbList");
        const invoiceRaw = firstTagAnywhere(scopeXml, "Invoice");
        const invoiceCount = Number(invoiceRaw ?? "0");
        const alias = pickReceiverAlias(scopeXml);
        const senderAlias = pickSenderAlias(scopeXml);

        // Liste kaydı + (Invoice>0 | PK alias | PkList’te GibUserInfo)
        const isEInvoiceUser =
          Boolean(userBlock) &&
          ((!Number.isNaN(invoiceCount) && invoiceCount > 0) ||
            Boolean(alias) ||
            pkInfo.aliasCount > 0 ||
            pkInfo.infoTypeCount > 0);

        const reg =
          firstTagAnywhere(scopeXml, "FirstCreationTime") ??
          firstTagAnywhere(scopeXml, "AliasCreationTime") ??
          firstTagAnywhere(scopeXml, "AliasRegisterTime");

        return {
          ok: true,
          isEInvoiceUser,
          alias,
          senderAlias,
          registrationDate: reg,
          raw: {
            invoiceCount: Number.isNaN(invoiceCount) ? null : invoiceCount,
            inGibUserList: Boolean(userBlock),
            hasPkList: pkInfo.tagPresent,
            hasGbList: gbInfo.tagPresent,
            pkNil: pkInfo.nil,
            gbNil: gbInfo.nil,
            pkAliasCount: pkInfo.aliasCount,
            gbAliasCount: gbInfo.aliasCount,
            pkInfoTypeCount: pkInfo.infoTypeCount,
            pkSnippet: pkInfo.snippet,
            gbSnippet: gbInfo.snippet,
            mailAliases: allMailAliases(scopeXml),
          },
        };
      });
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Mükellef sorgu hatası",
      };
    }
  }

  private async sendDocument(opts: {
    ublXml: string;
    uuid: string;
    documentType: "EINVOICE" | "EARCHIVE" | "DESPATCHADVICE";
    alias?: string | null;
  }): Promise<
    | { ok: true; uuid: string; refId: string | null; raw: string }
    | { ok: false; error: string; raw?: string }
  > {
    const packed = ublToElogoZip(opts.uuid, opts.ublXml);
    const today = new Date().toISOString().slice(0, 10);
    // UBL Attachment’taki XSLT kullanılır; UseDefaultXSLT=0 XSLTUUID olmadan
    // e-Logo’da PDF üretimini düşürebiliyor (belge var, PDF yok).
    const params = [`DOCUMENTTYPE=${opts.documentType}`, "SIGNED=0"];
    const xsltUuid = process.env.ELOGO_XSLT_UUID?.trim();
    if (xsltUuid) {
      params.push("UseDefaultXSLT=0", `XSLTUUID=${xsltUuid}`);
    }
    if (opts.alias?.trim()) {
      params.push(`ALIAS=${opts.alias.trim()}`);
    }

    return this.withSession(async (sessionID) => {
      const body = `<tem:SendDocument>
      <tem:sessionID>${escapeXml(sessionID)}</tem:sessionID>
      ${paramListXml(params)}
      <tem:document>
        <efat:binaryData>
          <efat:Value>${packed.base64}</efat:Value>
          <efat:contentType>base64</efat:contentType>
        </efat:binaryData>
        <efat:currentDate>${today}</efat:currentDate>
        <efat:fileName>${escapeXml(packed.fileName)}</efat:fileName>
        <efat:hash>${packed.hash}</efat:hash>
      </tem:document>
    </tem:SendDocument>`;

      const res = await postElogoSoap({
        endpoint: this.creds.endpoint,
        soapAction: this.soapAction("SendDocument"),
        envelope: buildElogoEnvelope(body),
      });

      const fault = extractSoapFault(res.body);
      if (fault) return { ok: false, error: fault, raw: res.body };
      if (!res.ok) {
        return {
          ok: false,
          error: `SendDocument — ${summarizeHttpError(res.status, res.body)}`,
          raw: res.body,
        };
      }

      const code = resultCode(res.body);
      if (code && code !== "1") {
        return {
          ok: false,
          error: resultMsg(res.body) || `SendDocument resultCode=${code}`,
          raw: res.body,
        };
      }

      const refId =
        xmlTagValue(res.body, "refId") ?? firstTagAnywhere(res.body, "refId");

      return {
        ok: true,
        uuid: opts.uuid,
        refId,
        raw: res.body,
      };
    });
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
      const sent = await this.sendDocument({
        ublXml: input.ublXml,
        uuid: input.uuid,
        documentType: "EARCHIVE",
      });
      if (!sent.ok) return { ok: false, error: sent.error, raw: sent.raw };

      let pdfBase64: string | null = null;
      for (let attempt = 0; attempt < 6 && !pdfBase64; attempt++) {
        if (attempt > 0) {
          await new Promise((r) => setTimeout(r, 2000 * attempt));
        }
        try {
          const dl = await this.downloadOutgoing(input.uuid, {
            documentType: "EARCHIVE",
            uuid: input.uuid,
          });
          if (dl.ok && dl.pdfBase64) pdfBase64 = dl.pdfBase64;
        } catch {
          /* PDF henüz hazır olmayabilir */
        }
      }

      return {
        ok: true,
        uuid: input.uuid,
        faturaNo: sent.refId,
        faturaURL: null,
        pdfBase64,
        raw: sent.raw,
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
        belgeOid: input.uuid,
        uuid: input.uuid,
      };
    }

    try {
      const sent = await this.sendDocument({
        ublXml: input.ublXml,
        uuid: input.uuid,
        documentType: "EINVOICE",
        alias: input.alias,
      });
      if (!sent.ok) return { ok: false, error: sent.error, raw: sent.raw };

      // Durum/PDF sorgusu ETTN (uuid) ile yapılır
      return {
        ok: true,
        belgeOid: input.uuid,
        uuid: input.uuid,
        raw: sent.raw,
      };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "e-Fatura gönderim hatası",
      };
    }
  }

  async sendDespatch(input: {
    ublXml: string;
    uuid: string;
    alias?: string | null;
  }): Promise<DespatchSendResult> {
    if (this.mockMode) {
      return {
        ok: true,
        belgeOid: input.uuid,
        uuid: input.uuid,
      };
    }

    try {
      const sent = await this.sendDocument({
        ublXml: input.ublXml,
        uuid: input.uuid,
        documentType: "DESPATCHADVICE",
        alias: input.alias,
      });
      if (!sent.ok) return { ok: false, error: sent.error, raw: sent.raw };

      return {
        ok: true,
        belgeOid: input.uuid,
        uuid: input.uuid,
        raw: sent.raw,
      };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "e-İrsaliye gönderim hatası",
      };
    }
  }

  async getOutgoingStatus(
    belgeOid: string,
    options?: EDocumentRefOptions,
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

    const uuid = (options?.uuid || belgeOid).trim();
    const documentType = options?.documentType ?? "EINVOICE";

    try {
      return await this.withSession(async (sessionID) => {
        const body = `<tem:GetDocumentStatus>
      <tem:sessionID>${escapeXml(sessionID)}</tem:sessionID>
      <tem:uuid>${escapeXml(uuid)}</tem:uuid>
      ${paramListXml([`DOCUMENTTYPE=${documentType}`])}
    </tem:GetDocumentStatus>`;

        const res = await postElogoSoap({
          endpoint: this.creds.endpoint,
          soapAction: this.soapAction("GetDocumentStatus"),
          envelope: buildElogoEnvelope(body),
        });

        const fault = extractSoapFault(res.body);
        if (fault) return { ok: false, error: fault, raw: res.body };
        if (!res.ok) {
          return {
            ok: false,
            error: `GetDocumentStatus — ${summarizeHttpError(res.status, res.body)}`,
            raw: res.body,
          };
        }

        const code = resultCode(res.body);
        if (code && code !== "1") {
          return {
            ok: false,
            error: resultMsg(res.body) || `Durum resultCode=${code}`,
            raw: res.body,
          };
        }

        const statusVal =
          firstTagAnywhere(res.body, "status") ??
          firstTagAnywhere(res.body, "Status");
        const codeVal =
          firstTagAnywhere(res.body, "code") ??
          firstTagAnywhere(res.body, "Code");
        const description =
          firstTagAnywhere(res.body, "description") ??
          firstTagAnywhere(res.body, "Description") ??
          resultMsg(res.body);
        const elementId =
          firstTagAnywhere(res.body, "ElementId") ??
          firstTagAnywhere(res.body, "elementId");

        const mapped = mapElogoStatus(documentType, statusVal, codeVal);
        let pdfBase64: string | null = null;
        if (mapped === "COMPLETED") {
          const dl = await this.downloadOutgoing(belgeOid, {
            documentType,
            uuid,
          });
          if (dl.ok) pdfBase64 = dl.pdfBase64 ?? null;
        }

        return {
          ok: true,
          status: mapped,
          message: description,
          faturaNo: elementId,
          faturaURL: null,
          pdfBase64,
          raw: res.body,
        };
      });
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Durum sorgu hatası",
      };
    }
  }

  async downloadOutgoing(
    belgeOid: string,
    options?: EDocumentRefOptions,
  ): Promise<DownloadOutgoingResult> {
    if (this.mockMode) {
      return { ok: true, pdfBase64: MINIMAL_PDF_B64, faturaURL: null };
    }

    const uuid = (options?.uuid || belgeOid).trim();
    const documentType = options?.documentType ?? "EINVOICE";
    const typeAttempts = documentTypeDownloadAttempts(documentType);

    try {
      return await this.withSession(async (sessionID) => {
        let lastError = "PDF alınamadı.";
        for (const dt of typeAttempts) {
          const pulled = await this.getDocumentDataPdf(sessionID, uuid, dt);
          if (pulled.ok) return pulled;
          lastError = pulled.error;
        }
        for (const dt of typeAttempts.filter((t) => !t.startsWith("DRAFT"))) {
          const ubl = await this.getDocumentDataRaw(
            sessionID,
            uuid,
            dt,
            "UBL",
          );
          if (ubl.ok) {
            return {
              ok: false,
              error:
                "Fatura e-Logo’da kayıtlı ama PDF üretilemedi. Yeni bir fatura kesin (görsel şablon düzeltildi).",
            };
          }
        }
        return { ok: false, error: lastError };
      });
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "PDF indirme hatası",
      };
    }
  }

  private async getDocumentDataRaw(
    sessionID: string,
    uuid: string,
    documentType: string,
    dataFormat: "PDF" | "UBL" | "HTML",
  ): Promise<{ ok: true; rawB64: string } | { ok: false; error: string }> {
    const body = `<tem:GetDocumentData>
      <tem:sessionID>${escapeXml(sessionID)}</tem:sessionID>
      <tem:uuid>${escapeXml(uuid)}</tem:uuid>
      ${paramListXml([
        `DOCUMENTTYPE=${documentType}`,
        `DATAFORMAT=${dataFormat}`,
      ])}
    </tem:GetDocumentData>`;

    const res = await postElogoSoap({
      endpoint: this.creds.endpoint,
      soapAction: this.soapAction("GetDocumentData"),
      envelope: buildElogoEnvelope(body),
    });

    const fault = extractSoapFault(res.body);
    if (fault) return { ok: false, error: fault };
    if (!res.ok) {
      return {
        ok: false,
        error: `GetDocumentData — ${summarizeHttpError(res.status, res.body)}`,
      };
    }

    const code = resultCode(res.body);
    if (code && code !== "1") {
      return {
        ok: false,
        error: resultMsg(res.body) || `${dataFormat} resultCode=${code}`,
      };
    }

    const rawB64 = extractDocumentBinaryBase64(res.body);
    if (!rawB64) {
      return { ok: false, error: `${dataFormat} verisi dönmedi` };
    }
    return { ok: true, rawB64 };
  }

  private async getDocumentDataPdf(
    sessionID: string,
    uuid: string,
    documentType: string,
  ): Promise<DownloadOutgoingResult> {
    const raw = await this.getDocumentDataRaw(
      sessionID,
      uuid,
      documentType,
      "PDF",
    );
    if (!raw.ok) return raw;

    const pdfBase64 = await normalizeElogoPdfBase64(raw.rawB64);
    if (!pdfBase64) {
      return {
        ok: false,
        error:
          "e-Logo yanıtı PDF değil (zip/HTML). Belge henüz hazır olmayabilir.",
      };
    }

    return { ok: true, pdfBase64, faturaURL: null };
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
    const elementId = (input.faturaNo ?? "").trim();
    if (!uuid && !elementId) {
      return { ok: false, error: "İptal için ETTN veya fatura numarası gerekli." };
    }

    const packed = ublToElogoZip(uuid || elementId, "<Cancel/>");
    const today = new Date().toISOString().slice(0, 10);

    const attempts: string[][] = [];
    if (uuid) {
      attempts.push(["DOCUMENTTYPE=CANCELEARCHIVEINVOICE", `UUID=${uuid}`]);
      attempts.push([
        "DOCUMENTTYPE=CANCELEARCHIVETYPE2",
        `UUID=${uuid}`,
        "DESCRIPTION=Yanlis kesim iptali",
      ]);
    }
    if (elementId) {
      attempts.push([
        "DOCUMENTTYPE=CANCELEARCHIVEINVOICE",
        `ELEMENTID=${elementId}`,
      ]);
      if (uuid) {
        attempts.push([
          "DOCUMENTTYPE=CANCELEARCHIVEINVOICE",
          `UUID=${uuid}`,
          `ELEMENTID=${elementId}`,
        ]);
      }
    }

    try {
      return await this.withSession(async (sessionID) => {
        let lastError = "Aradığınız kriterlere göre fatura bulunamadı.";
        for (const params of attempts) {
          const body = `<tem:SendDocument>
      <tem:sessionID>${escapeXml(sessionID)}</tem:sessionID>
      ${paramListXml(params)}
      <tem:document>
        <efat:binaryData>
          <efat:Value>${packed.base64}</efat:Value>
          <efat:contentType>base64</efat:contentType>
        </efat:binaryData>
        <efat:currentDate>${today}</efat:currentDate>
        <efat:fileName>${escapeXml(packed.fileName)}</efat:fileName>
        <efat:hash>${packed.hash}</efat:hash>
      </tem:document>
    </tem:SendDocument>`;

          const res = await postElogoSoap({
            endpoint: this.creds.endpoint,
            soapAction: this.soapAction("SendDocument"),
            envelope: buildElogoEnvelope(body),
          });

          const fault = extractSoapFault(res.body);
          if (fault) {
            lastError = fault;
            if (!/bulunamadı|bulunamadi|kriter/i.test(fault)) {
              return { ok: false, error: fault, raw: res.body };
            }
            continue;
          }
          if (!res.ok) {
            lastError = `e-Logo iptal — ${summarizeHttpError(res.status, res.body)}`;
            continue;
          }

          const code = resultCode(res.body);
          if (code && code !== "1") {
            lastError = resultMsg(res.body) || `İptal resultCode=${code}`;
            if (!/bulunamadı|bulunamadi|kriter/i.test(lastError)) {
              return { ok: false, error: lastError, raw: res.body };
            }
            continue;
          }

          return { ok: true, raw: res.body };
        }

        return { ok: false, error: lastError };
      });
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

    try {
      return await this.withSession(async (sessionID) => {
        const listed = await this.fetchIncomingList(sessionID, input);
        if (!listed.ok) return listed;
        return { ok: true, invoices: listed.invoices };
      });
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Gelen fatura listesi alınamadı.",
      };
    }
  }

  private async fetchIncomingList(
    sessionID: string,
    input: { from: string; to: string },
  ): Promise<ListIncomingResult> {
    const attempts = [
      [
        "DOCUMENTTYPE=EINVOICEDETAIL",
        "OPTYPE=2",
        `BEGINDATE=${input.from}`,
        `ENDDATE=${input.to}`,
        "DATEBY=1",
      ],
      [
        "DOCUMENTTYPE=EINVOICE",
        "OPTYPE=2",
        `BEGINDATE=${input.from}`,
        `ENDDATE=${input.to}`,
        "DATEBY=1",
      ],
    ];

    let lastError = "Gelen fatura bulunamadı.";
    for (const params of attempts) {
      const body = `<tem:GetDocumentList>
      <tem:sessionID>${escapeXml(sessionID)}</tem:sessionID>
      ${paramListXml(params)}
    </tem:GetDocumentList>`;

      const res = await postElogoSoap({
        endpoint: this.creds.endpoint,
        soapAction: this.soapAction("GetDocumentList"),
        envelope: buildElogoEnvelope(body),
      });

      const fault = extractSoapFault(res.body);
      if (fault) {
        lastError = fault;
        continue;
      }
      if (!res.ok) {
        lastError = `GetDocumentList — ${summarizeHttpError(res.status, res.body)}`;
        continue;
      }

      const code = resultCode(res.body);
      // 0 = belge yok (boş liste), 1 = başarılı
      if (code && code !== "1" && code !== "0") {
        lastError = resultMsg(res.body) || `Liste resultCode=${code}`;
        continue;
      }

      return { ok: true, invoices: parseElogoIncomingDocuments(res.body) };
    }

    return { ok: false, error: lastError };
  }

  async downloadIncoming(uuid: string): Promise<DownloadOutgoingResult> {
    return this.downloadOutgoing(uuid, {
      documentType: "EINVOICE",
      uuid,
    });
  }

  async sendIncomingResponse(input: {
    uuid: string;
    decision: "KABUL" | "RED";
    description: string;
    alias?: string | null;
  }): Promise<IncomingResponseResult> {
    if (this.mockMode) return { ok: true };

    const uuid = input.uuid.trim();
    if (!uuid) return { ok: false, error: "Yanıt için fatura UUID gerekli." };
    const description = input.description.trim() || input.decision;

    const packed = ublToElogoZip(uuid, "<ApplicationResponse/>");
    const today = new Date().toISOString().slice(0, 10);
    const params = [
      "DOCUMENTTYPE=CREATEAPPLICATIONRESPONSE",
      `UUID=${uuid}`,
      `APPLICATIONRESPONSE=${input.decision}`,
      `DESCRIPTION=${description}`,
    ];
    if (input.alias?.trim()) {
      params.push(`ALIAS=${input.alias.trim()}`);
    }

    try {
      return await this.withSession(async (sessionID) => {
        const body = `<tem:SendDocument>
      <tem:sessionID>${escapeXml(sessionID)}</tem:sessionID>
      ${paramListXml(params)}
      <tem:document>
        <efat:binaryData>
          <efat:Value>${packed.base64}</efat:Value>
          <efat:contentType>base64</efat:contentType>
        </efat:binaryData>
        <efat:currentDate>${today}</efat:currentDate>
        <efat:fileName>${escapeXml(packed.fileName)}</efat:fileName>
        <efat:hash>${packed.hash}</efat:hash>
      </tem:document>
    </tem:SendDocument>`;

        const res = await postElogoSoap({
          endpoint: this.creds.endpoint,
          soapAction: this.soapAction("SendDocument"),
          envelope: buildElogoEnvelope(body),
        });

        const fault = extractSoapFault(res.body);
        if (fault) return { ok: false, error: fault, raw: res.body };
        if (!res.ok) {
          return {
            ok: false,
            error: `Uygulama yanıtı — ${summarizeHttpError(res.status, res.body)}`,
            raw: res.body,
          };
        }

        const code = resultCode(res.body);
        if (code && code !== "1") {
          return {
            ok: false,
            error: resultMsg(res.body) || `Yanıt resultCode=${code}`,
            raw: res.body,
          };
        }

        return { ok: true, raw: res.body };
      });
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Uygulama yanıtı gönderilemedi.",
      };
    }
  }
}

function parseElogoIncomingDocuments(xml: string): IncomingInvoice[] {
  const blocks =
    xml.match(/<(?:[\w-]+:)?Document\b[\s\S]*?<\/(?:[\w-]+:)?Document>/gi) ??
    [];
  const invoices: IncomingInvoice[] = [];
  const seen = new Set<string>();

  for (const block of blocks) {
    const info = parseElogoDocInfo(block);
    const uuid =
      info.UUID ||
      firstTagAnywhere(block, "documentUuid") ||
      firstTagAnywhere(block, "DocumentUuid") ||
      "";
    if (!uuid || /nil/i.test(uuid) || seen.has(uuid)) continue;
    seen.add(uuid);

    const profileId = info.PROFILEID || info.INVOICETYPE || null;
    const appRaw =
      info.APPRESPRESULT || info.RESPCODE || info.APPRESPONSE || info.APPRESP;
    invoices.push({
      uuid,
      invoiceNo:
        info.ELEMENTID ||
        info.DOCUMENTID ||
        firstTagAnywhere(block, "documentId"),
      issueDate: toIsoDay(info.ISSUEDATE || info.CURRENTDATE),
      receivedAt: toIsoDay(info.CURRENTDATE || info.ISSUEDATE),
      supplierName:
        info.SUPPLIERPARTYNAME || info.SENDERTITLE || info.SUPPLIERNAME || null,
      supplierVkn:
        info.SUPPLIERVKNTCKN || info.SENDERVKNTCKN || info.VKNTCKN || null,
      payableAmount:
        info.PAYABLEAMOUNT || info.INVOICETOTAL || info.TAXINCLUSIVEAMOUNT || null,
      currency: info.CURRENCYUNIT || info.CURRENCY || "TRY",
      profileId,
      appStatus: mapAppRespResult(appRaw),
      gbAlias: info.GBALIAS || info.ALIAS || null,
    });
  }
  return invoices;
}

function parseElogoDocInfo(block: string): Record<string, string> {
  const info: Record<string, string> = {};
  const re =
    /<(?:[\w-]+:)?string>([\s\S]*?)<\/(?:[\w-]+:)?string>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) {
    const raw = m[1]
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .trim();
    const eq = raw.indexOf("=");
    if (eq <= 0) continue;
    info[raw.slice(0, eq).trim().toUpperCase()] = raw.slice(eq + 1).trim();
  }
  const uuidTag = firstTagAnywhere(block, "documentUuid");
  if (uuidTag && !/nil/i.test(uuidTag)) info.UUID = uuidTag;
  const idTag = firstTagAnywhere(block, "documentId");
  if (idTag) info.DOCUMENTID = idTag;
  return info;
}

function toIsoDay(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = value.match(/(\d{4}-\d{2}-\d{2})/);
  return m?.[1] ?? null;
}
