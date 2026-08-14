import "server-only";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const NS_WSSE =
  "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd";
const NS_WSU =
  "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd";
const PASSWORD_TEXT =
  "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText";

/** WS-Security UsernameToken (PasswordText) — QNB/eFinans connector. */
export function buildSoapEnvelope(opts: {
  username: string;
  password: string;
  bodyXml: string;
  /** Cookie auth kullanılıyorsa header’da Security gönderme */
  omitSecurity?: boolean;
}): string {
  const user = escapeXml(opts.username);
  const pass = escapeXml(opts.password);
  const created = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

  const security = opts.omitSecurity
    ? ""
    : `<soapenv:Header>
    <wsse:Security xmlns:wsse="${NS_WSSE}" xmlns:wsu="${NS_WSU}">
      <wsse:UsernameToken>
        <wsse:Username>${user}</wsse:Username>
        <wsse:Password Type="${PASSWORD_TEXT}">${pass}</wsse:Password>
        <wsu:Created>${created}</wsu:Created>
      </wsse:UsernameToken>
    </wsse:Security>
  </soapenv:Header>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="http://service.connector.uut.cs.com.tr/">
  ${security || "<soapenv:Header/>"}
  <soapenv:Body>
${opts.bodyXml}
  </soapenv:Body>
</soapenv:Envelope>`;
}

export function xmlTagValue(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = xml.match(re);
  if (!m?.[1]) return null;
  return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
}

export function extractSoapFault(body: string): string | null {
  return (
    xmlTagValue(body, "faultstring") ??
    xmlTagValue(body, "FaultString") ??
    xmlTagValue(body, "message") ??
    null
  );
}

function formatFetchError(err: unknown, endpoint: string): string {
  const parts: string[] = [`QNB’ye ulaşılamadı (${endpoint})`];
  if (err instanceof Error) {
    parts.push(err.message);
    const cause = (err as Error & { cause?: unknown }).cause;
    if (cause instanceof Error) parts.push(cause.message);
  } else {
    parts.push(String(err));
  }
  return parts.join(" — ");
}

function parseSetCookie(headers: Headers): string[] {
  // Node fetch: getSetCookie() varsa kullan
  const anyHeaders = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof anyHeaders.getSetCookie === "function") {
    return anyHeaders.getSetCookie();
  }
  const single = headers.get("set-cookie");
  return single ? [single] : [];
}

/** Set-Cookie satırlarından Cookie request header değeri. */
export function cookiesFromSetCookie(setCookies: string[]): string {
  return setCookies
    .map((c) => c.split(";")[0]?.trim())
    .filter(Boolean)
    .join("; ");
}

export async function postSoap(opts: {
  endpoint: string;
  soapAction: string;
  envelope: string;
  cookie?: string;
}): Promise<{
  ok: boolean;
  status: number;
  body: string;
  setCookies: string[];
}> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: opts.soapAction.includes("://")
        ? `"${opts.soapAction}"`
        : `"http://service.connector.uut.cs.com.tr/${opts.soapAction}"`,
    };
    if (opts.cookie) headers.Cookie = opts.cookie;

    const res = await fetch(opts.endpoint, {
      method: "POST",
      headers,
      body: opts.envelope,
      cache: "no-store",
    });
    const body = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      body,
      setCookies: parseSetCookie(res.headers),
    };
  } catch (err) {
    throw new Error(formatFetchError(err, opts.endpoint));
  }
}

export function wsdlToEndpoint(wsdlUrl: string): string {
  return wsdlUrl.replace(/\?wsdl$/i, "").replace(/&wsdl$/i, "");
}

/** connectorService WSDL → userService endpoint */
export function connectorWsdlToUserServiceEndpoint(connectorWsdl: string): string {
  const ep = wsdlToEndpoint(connectorWsdl);
  return ep.replace(/connectorService$/i, "userService");
}

/**
 * QNB userService wsLogin — başarılıysa Cookie header değeri döner.
 * Dokümandaki Cookie auth yöntemi.
 */
export async function qnbWsLogin(opts: {
  userServiceEndpoint: string;
  username: string;
  password: string;
}): Promise<{ ok: true; cookie: string } | { ok: false; error: string }> {
  const bodyVariants = [
    `<ser:wsLogin>
  <userId>${escapeXml(opts.username)}</userId>
  <password>${escapeXml(opts.password)}</password>
</ser:wsLogin>`,
    `<ser:wsLogin>
  <kullaniciKodu>${escapeXml(opts.username)}</kullaniciKodu>
  <sifre>${escapeXml(opts.password)}</sifre>
</ser:wsLogin>`,
  ];

  let lastError = "wsLogin başarısız";

  for (const bodyXml of bodyVariants) {
    const envelope = buildSoapEnvelope({
      username: opts.username,
      password: opts.password,
      bodyXml,
      omitSecurity: true,
    });
    try {
      const res = await postSoap({
        endpoint: opts.userServiceEndpoint,
        soapAction: "wsLogin",
        envelope,
      });
      const fault = extractSoapFault(res.body);
      if (fault) {
        lastError = fault;
        continue;
      }
      const cookie = cookiesFromSetCookie(res.setCookies);
      const sessionInBody =
        xmlTagValue(res.body, "sessionId") ??
        xmlTagValue(res.body, "return") ??
        "";
      if (cookie) {
        return { ok: true, cookie };
      }
      if (sessionInBody && sessionInBody.length > 8 && !sessionInBody.includes("<")) {
        return { ok: true, cookie: `JSESSIONID=${sessionInBody}` };
      }
      if (!res.ok) {
        lastError = `wsLogin HTTP ${res.status}: ${(res.body || "").slice(0, 240)}`;
        continue;
      }
      lastError = "wsLogin yanıtında oturum çerezi yok";
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }

  return { ok: false, error: lastError };
}

export function summarizeHttpError(status: number, body: string): string {
  const fault = extractSoapFault(body);
  if (fault) return `HTTP ${status}: ${fault}`;
  const snippet = body.replace(/\s+/g, " ").trim().slice(0, 280);
  return snippet
    ? `HTTP ${status}: ${snippet}`
    : `HTTP ${status} (boş yanıt — SOAP/auth formatı veya yetki sorunu olabilir)`;
}

export { escapeXml };
