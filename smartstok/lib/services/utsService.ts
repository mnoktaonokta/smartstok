/**
 * Sağlık Bakanlığı ÜTS — firma envanter sorgusu.
 *
 * UI karşılığı: Ürün Hareketleri → Ayrıntılı Sorgulama → Tekil Ürün Sorgula
 * (üzerinizdeki stoklar — bayinin alma ile aldığı ürünler)
 *
 * NOT: tekilUrun/uretici/sorgula yalnızca üretici/ithalatçı sahipliği içindir;
 * bayi stoklarında boş SNC döner. Öncelik ayrintiliTekilUrun + tekilUrun/sorgula.
 */

import { resolveUtsCredentials } from "@/lib/services/app-credentials";

const DEFAULT_BASE_URL = "https://utsuygulama.saglik.gov.tr";
const PAGE_SIZE = 250;
const MAX_PAGES = 40;

export type UtsInventoryItem = {
  barcode: string;
  lotNumber: string;
  quantity: number;
  productName?: string;
};

export type FirmInventoryResult = {
  items: UtsInventoryItem[];
  /** ÜTS MSJ (UYARI / BILGI) metinleri */
  notices: string[];
};

type UtsMessage = {
  TIP?: string;
  MET?: string;
  tip?: string;
  met?: string;
};

type RawInventoryRow = Record<string, unknown>;

type QueryStrategy = {
  label: string;
  url: string;
  /** İlk sayfa gövdesi */
  body: Record<string, unknown>;
  mode: "ayrintili" | "tekil" | "uretici-offset" | "uretici-san";
};

async function getConfig() {
  const { token, firmNo, apiUrl } = await resolveUtsCredentials();
  return {
    token: token || undefined,
    firmNo: firmNo || undefined,
    apiUrl: apiUrl || DEFAULT_BASE_URL,
  };
}

function getUtsHost(apiUrl: string): string {
  try {
    const u = new URL(apiUrl.includes("://") ? apiUrl : `https://${apiUrl}`);
    return u.origin;
  } catch {
    return DEFAULT_BASE_URL;
  }
}

function buildStrategies(apiUrl: string): QueryStrategy[] {
  const host = getUtsHost(apiUrl);

  return [
    // UI: Ayrıntılı Sorgulama → Tekil Ürün Sorgula (tüm alanlar opsiyonel)
    {
      label: "ayrintiliTekilUrun",
      url: `${host}/UTS/rest/ayrintiliTekilUrun/sorgula`,
      body: { ADT: PAGE_SIZE, SAY: 0 },
      mode: "ayrintili",
    },
    // Alternatif path (bazı ortamlarda uh altında)
    {
      label: "ayrintiliTekilUrun-uh",
      url: `${host}/UTS/uh/rest/ayrintiliTekilUrun/sorgula`,
      body: { ADT: PAGE_SIZE, SAY: 0 },
      mode: "ayrintili",
    },
    // Kurum üzerindeki tekil ürünler — filtre yok / yalnızca sayfa
    {
      label: "tekilUrun-sorgula",
      url: `${host}/UTS/uh/rest/tekilUrun/sorgula`,
      body: { SAN: 0 },
      mode: "tekil",
    },
    {
      label: "tekilUrun-sorgula-empty",
      url: `${host}/UTS/uh/rest/tekilUrun/sorgula`,
      body: {},
      mode: "tekil",
    },
    // Üretici/ithalatçı (bayi için genelde boş kalır — son çare)
    {
      label: "uretici-offset",
      url: `${host}/UTS/uh/rest/tekilUrun/uretici/sorgula/offset`,
      body: { ADT: PAGE_SIZE },
      mode: "uretici-offset",
    },
  ];
}

function translateUtsHttpError(status: number, bodyText?: string): string {
  if (status === 401 || status === 403) {
    return "ÜTS Sistem Yetki Hatası: Token geçersiz veya süresi dolmuş.";
  }
  if (status === 404) {
    return "ÜTS servis adresi bulunamadı. Lütfen sistem yöneticisine bildirin.";
  }
  if (status === 500 || status === 502 || status === 503) {
    return "ÜTS sunucularında geçici bir sorun var, lütfen daha sonra tekrar deneyin.";
  }
  if (status === 0) {
    return "Bağlantı Hatası: ÜTS sunucusuna ulaşılamadı.";
  }
  const snippet = bodyText?.replace(/\s+/g, " ").trim().slice(0, 160);
  return snippet
    ? `ÜTS Hatası (HTTP ${status}): ${snippet}`
    : `ÜTS Hatası: Beklenmeyen HTTP yanıtı (${status}).`;
}

function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function asNumber(value: unknown, fallback = 1): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function extractRows(data: unknown): RawInventoryRow[] {
  if (!data || typeof data !== "object") return [];
  const root = data as Record<string, unknown>;

  const snc = root.SNC ?? root.snc;

  // Offset API: SNC = { LST: [...], OFF }
  if (snc && typeof snc === "object" && !Array.isArray(snc)) {
    const nested = snc as Record<string, unknown>;
    const lst = nested.LST ?? nested.lst ?? nested.liste;
    if (Array.isArray(lst)) {
      return lst.filter(
        (row): row is RawInventoryRow =>
          Boolean(row) && typeof row === "object" && !Array.isArray(row),
      );
    }
  }

  const candidates = [
    snc,
    root.sonuc,
    root.kayitlar,
    root.liste,
    root.tekilUrunler,
    root.LST,
    root.items,
    root.data,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter(
        (row): row is RawInventoryRow =>
          Boolean(row) && typeof row === "object" && !Array.isArray(row),
      );
    }
  }

  if (Array.isArray(data)) {
    return data.filter(
      (row): row is RawInventoryRow =>
        Boolean(row) && typeof row === "object" && !Array.isArray(row),
    );
  }

  return [];
}

function extractNextOffset(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const root = data as Record<string, unknown>;
  const snc = root.SNC ?? root.snc;
  if (!snc || typeof snc !== "object" || Array.isArray(snc)) return null;
  const off =
    (snc as Record<string, unknown>).OFF ??
    (snc as Record<string, unknown>).off;
  const value = asString(off);
  return value || null;
}

function extractMessages(data: unknown): string[] {
  if (!data || typeof data !== "object") return [];
  const root = data as Record<string, unknown>;
  const msj = root.MSJ ?? root.msj;
  if (!Array.isArray(msj)) return [];

  return (msj as UtsMessage[])
    .map((m) => {
      const tip = (m.TIP ?? m.tip ?? "").toUpperCase();
      const met = (m.MET ?? m.met ?? "").trim();
      if (!met || tip === "HATA") return null;
      return tip ? `[${tip}] ${met}` : met;
    })
    .filter((m): m is string => Boolean(m));
}

function extractErrors(data: unknown): string[] {
  if (!data || typeof data !== "object") return [];
  const root = data as Record<string, unknown>;
  const msj = root.MSJ ?? root.msj;
  if (!Array.isArray(msj)) return [];

  return (msj as UtsMessage[])
    .filter((m) => (m.TIP ?? m.tip ?? "").toUpperCase() === "HATA")
    .map((m) => (m.MET ?? m.met ?? "").trim())
    .filter(Boolean);
}

function describeSnc(data: unknown): string {
  if (!data || typeof data !== "object") return "yanıt yok";
  const snc = (data as Record<string, unknown>).SNC;
  if (snc === null) return "SNC=null";
  if (snc === undefined) return "SNC=yok";
  if (Array.isArray(snc)) return `SNC=array(${snc.length})`;
  if (typeof snc === "object") {
    const keys = Object.keys(snc as object);
    const lst = (snc as Record<string, unknown>).LST;
    const lstInfo = Array.isArray(lst) ? `LST(${lst.length})` : "LST=yok";
    return `SNC=object{${keys.join(",")}} ${lstInfo}`;
  }
  return `SNC=${typeof snc}`;
}

function mapRow(row: RawInventoryRow, index: number): UtsInventoryItem {
  const barcode =
    asString(row.UNO) ||
    asString(row.urunNumarasi) ||
    asString(row.barcode) ||
    asString(row.Barkod) ||
    `unknown-${index}`;

  const lotNumber =
    asString(row.LNO) ||
    asString(row.lotBatchNumarasi) ||
    asString(row.SNO) ||
    asString(row.seriNumarasi) ||
    "—";

  const quantity = asNumber(
    row.ADT ?? row.adet ?? row.quantity ?? row.miktar,
    1,
  );

  const productName =
    asString(row.MME) ||
    asString(row.urunTanimi) ||
    asString(row.GAD) ||
    asString(row.KUU) ||
    asString(row.productName) ||
    undefined;

  return {
    barcode,
    lotNumber,
    quantity,
    productName: productName || undefined,
  };
}

async function postInventory(
  url: string,
  token: string,
  body: Record<string, unknown>,
): Promise<{ status: number; ok: boolean; data: unknown; rawText: string }> {
  console.log("[ÜTS] getFirmInventory → İSTEK", { url, body });

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        utsToken: token,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new Error(translateUtsHttpError(0));
  }

  const rawText = await response.text();
  let data: unknown = null;
  try {
    data = rawText ? JSON.parse(rawText) : null;
  } catch {
    data = null;
  }

  console.log("ÜTS RAW RESPONSE:", data);
  console.log("[ÜTS] getFirmInventory → CEVAP", {
    url,
    status: response.status,
    ok: response.ok,
    snc: describeSnc(data),
    responseText: rawText.slice(0, 4000),
  });

  return {
    status: response.status,
    ok: response.ok,
    data,
    rawText,
  };
}

async function paginateStrategy(
  strategy: QueryStrategy,
  token: string,
  first: { data: unknown },
): Promise<UtsInventoryItem[]> {
  const items: UtsInventoryItem[] = [];
  const firstRows = extractRows(first.data);
  items.push(...firstRows.map((row, i) => mapRow(row, i)));

  if (strategy.mode === "ayrintili") {
    for (let say = 1; say < MAX_PAGES; say += 1) {
      if (firstRows.length < PAGE_SIZE && say === 1 && firstRows.length < 15) {
        // İlk sayfa default 15 veya ADT'den azsa muhtemelen bitti;
        // yine de ADT=PAGE_SIZE gönderdiysek PAGE_SIZE kontrolü yeterli
      }
      if (firstRows.length === 0) break;
      if (say === 1 && firstRows.length < PAGE_SIZE) break;

      const pageRes = await postInventory(strategy.url, token, {
        ADT: PAGE_SIZE,
        SAY: say,
      });
      if (!pageRes.ok) break;
      const rows = extractRows(pageRes.data);
      if (rows.length === 0) break;
      items.push(...rows.map((row, i) => mapRow(row, items.length + i)));
      if (rows.length < PAGE_SIZE) break;
    }
    return items;
  }

  if (strategy.mode === "uretici-offset") {
    let nextOff = extractNextOffset(first.data);
    let page = 1;
    while (nextOff && page < MAX_PAGES) {
      const pageRes = await postInventory(strategy.url, token, {
        ADT: PAGE_SIZE,
        OFF: nextOff,
      });
      if (!pageRes.ok) break;
      const rows = extractRows(pageRes.data);
      if (rows.length === 0) break;
      items.push(...rows.map((row, i) => mapRow(row, items.length + i)));
      nextOff = extractNextOffset(pageRes.data);
      page += 1;
    }
    return items;
  }

  // tekil / uretici-san: SAN ile sayfala
  if (firstRows.length > 0) {
    for (let san = 1; san < MAX_PAGES; san += 1) {
      const pageRes = await postInventory(strategy.url, token, {
        ...strategy.body,
        SAN: san,
      });
      if (!pageRes.ok) break;
      const rows = extractRows(pageRes.data);
      if (rows.length === 0) break;
      items.push(...rows.map((row, i) => mapRow(row, items.length + i)));
      if (rows.length < 10) break;
    }
  }

  return items;
}

/**
 * Tek barkod (UNO) ile üzerinizdeki stok satırlarını çeker.
 * Ayrıntılı liste API’si boş/404 dönerse yedek yol olarak kullanılır.
 */
export async function queryInventoryByUno(
  uno: string,
): Promise<UtsInventoryItem[]> {
  const { token, apiUrl } = await getConfig();
  if (!token) {
    throw new Error(
      "ÜTS yapılandırması eksik: UTS_TOKEN tanımlı değil. Lütfen sistem yöneticisine bildirin.",
    );
  }

  const code = uno.trim();
  if (!code) return [];

  const host = getUtsHost(apiUrl);
  const url = `${host}/UTS/uh/rest/tekilUrun/sorgula`;
  const items: UtsInventoryItem[] = [];
  const seen = new Set<string>();

  for (let san = 0; san < MAX_PAGES; san += 1) {
    const res = await postInventory(url, token, { UNO: code, SAN: san });
    if (!res.ok) break;
    if (extractErrors(res.data).length > 0) break;

    const rows = extractRows(res.data);
    if (rows.length === 0) break;

    for (const row of rows) {
      const mapped = mapRow(row, items.length);
      const key = `${mapped.barcode}::${mapped.lotNumber}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(mapped);
    }

    if (rows.length < 10) break;
  }

  return items;
}

/**
 * ÜTS’deki firma envanterini sorgular (sahip olunan / üzerinizdeki tekil ürünler).
 */
export async function getFirmInventory(): Promise<FirmInventoryResult> {
  const { token, apiUrl } = await getConfig();

  if (!token) {
    throw new Error(
      "ÜTS yapılandırması eksik: UTS_TOKEN tanımlı değil. Lütfen sistem yöneticisine bildirin.",
    );
  }

  const strategies = buildStrategies(apiUrl);
  const notices: string[] = [];
  const attemptLog: string[] = [];

  for (const strategy of strategies) {
    const probe = await postInventory(strategy.url, token, strategy.body);

    if (probe.status === 404) {
      attemptLog.push(`${strategy.label}: 404`);
      continue;
    }

    if (!probe.ok) {
      if (probe.status === 401 || probe.status === 403) {
        throw new Error(translateUtsHttpError(probe.status, probe.rawText));
      }
      attemptLog.push(`${strategy.label}: HTTP ${probe.status}`);
      continue;
    }

    const hatalar = extractErrors(probe.data);
    if (hatalar.length > 0) {
      attemptLog.push(`${strategy.label}: ${hatalar.join(" · ")}`);
      for (const h of hatalar) {
        if (!notices.includes(h)) notices.push(h);
      }
      continue;
    }

    for (const n of extractMessages(probe.data)) {
      if (!notices.includes(n)) notices.push(n);
    }

    const items = await paginateStrategy(strategy, token, probe);
    if (items.length > 0) {
      return { items, notices };
    }

    attemptLog.push(
      `${strategy.label}: 200 ama boş (${describeSnc(probe.data)})`,
    );
  }

  notices.push(
    "ÜTS UI’daki «Ayrıntılı Sorgulama → Tekil Ürün Sorgula» stoklarınızı gösterir; API tarafında denenen liste rotaları boş veya 404 döndü. Yerel barkod yedeği deneniyor…",
  );
  notices.push(`Denemeler: ${attemptLog.join(" · ")}`);

  return { items: [], notices };
}
