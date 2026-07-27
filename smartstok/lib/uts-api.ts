/**
 * Merkezi ÜTS (Ürün Takip Sistemi) API köprüsü.
 * Token ve base URL .env üzerinden okunur.
 */

const DEFAULT_UTS_API_URL = "https://utsuygulama.saglik.gov.tr/rest";

export type FetchUtsApiOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
};

export type FetchUtsApiResult<T = unknown> = {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
};

export type VermeBildirimiPayload = {
  gonderenKurumNo: string;
  alanKurumNo: string;
  urunBarkodu: string;
  lotBrcNo: string;
  miktar: number;
  belgeNo: string;
};

/** Alma bildirimi — karşı tarafın verme bildirimine (VBI) karşılık kabul. */
export type AlmaBildirimiPayload = {
  /** Verme Bildirim ID (VBI) */
  vermeBildirimId: string;
  /** Opsiyonel: lot bazlı kısmi alma adedi (ADT) */
  miktar?: number;
};

export type SendVermeBildirimiResult = {
  success: true;
  notificationId?: string;
};

export type SendAlmaBildirimiResult = {
  success: true;
  notificationId?: string;
};

type UtsMessage = {
  TIP?: string;
  MET?: string;
  KOD?: number | string;
};

type UtsBildirimResponse = {
  SNC?: string | null;
  MSJ?: UtsMessage[];
};

function getUtsConfig() {
  const token = process.env.UTS_TOKEN?.trim() ?? "";
  const firmNo = process.env.UTS_FIRM_NO?.trim() ?? "";
  const apiUrl = (
    process.env.UTS_API_URL?.trim() ||
    process.env.UTS_BASE_URL?.trim() ||
    DEFAULT_UTS_API_URL
  ).replace(/\/$/, "");

  return { token, firmNo, apiUrl };
}

/**
 * ÜTS sunucusuna yetkilendirilmiş HTTP isteği atar.
 */
export async function fetchUtsApi<T = unknown>(
  path: string,
  options: FetchUtsApiOptions = {},
): Promise<FetchUtsApiResult<T>> {
  const { token, apiUrl } = getUtsConfig();
  const method = options.method ?? "GET";
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${apiUrl}${normalizedPath}`;

  if (!token) {
    const message = "UTS_TOKEN tanımlı değil. .env dosyasını kontrol edin.";
    console.error("[ÜTS]", message);
    return { ok: false, status: 0, data: null, error: message };
  }

  try {
    const response = await fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: "no-store",
    });

    const rawText = await response.text();
    let data: T | null = null;
    if (rawText) {
      try {
        data = JSON.parse(rawText) as T;
      } catch {
        data = rawText as unknown as T;
      }
    }

    if (!response.ok) {
      const status = response.status;
      let error = `ÜTS HTTP ${status}`;

      if (status === 401) {
        error = "ÜTS yetki hatası (401): Token geçersiz veya süresi dolmuş.";
      } else if (status === 400) {
        error = "ÜTS istek hatası (400): Gönderilen veri geçersiz.";
      } else if (status === 500) {
        error = "ÜTS sunucu hatası (500): Geçici bir sorun oluştu.";
      }

      console.error("[ÜTS]", error, {
        url,
        method,
        status,
        body: rawText.slice(0, 500),
      });

      return { ok: false, status, data, error };
    }

    return { ok: true, status: response.status, data };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "ÜTS sunucusuna bağlanırken beklenmeyen hata.";
    console.error("[ÜTS] Ağ / istek hatası:", message, error);
    return { ok: false, status: 0, data: null, error: message };
  }
}

/**
 * VKN ile ÜTS kurum numarası sorgular (Firma Sorgula).
 * Endpoint: {host}/UTS/rest/kurum/firmaSorgula  body: { VRG }
 */
export async function fetchUtsKurumNoByVKN(vkn: string): Promise<string> {
  const cleaned = vkn.replace(/\D/g, "");
  if (!cleaned || cleaned.length < 10 || cleaned.length > 11) {
    throw new Error("Geçerli bir VKN (10 hane) veya TCKN (11 hane) girin.");
  }

  const { token, apiUrl } = getUtsConfig();
  if (!token) {
    throw new Error(
      "ÜTS yapılandırması eksik: UTS_TOKEN tanımlı değil. Lütfen sistem yöneticisine bildirin.",
    );
  }

  // UTS_API_URL genelde .../rest → resmi rota /UTS/rest/kurum/firmaSorgula
  const url = apiUrl.endsWith("/rest")
    ? `${apiUrl.slice(0, -"/rest".length)}/UTS/rest/kurum/firmaSorgula`
    : `${apiUrl}/UTS/rest/kurum/firmaSorgula`;

  const body = { VRG: cleaned };
  const payloadJson = JSON.stringify(body);

  console.log("[ÜTS] fetchUtsKurumNoByVKN → İSTEK", { url, payload: body });

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        // Resmi ÜTS istemcileri utsToken header bekler
        utsToken: token,
      },
      body: payloadJson,
      cache: "no-store",
    });
  } catch (networkError) {
    console.error("[ÜTS] fetchUtsKurumNoByVKN → AĞ HATASI", {
      url,
      networkError,
    });
    throw new Error(
      "ÜTS Kurum Sorgulama Hatası: Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.",
    );
  }

  const rawText = await response.text();
  let data: unknown = null;
  try {
    data = rawText ? JSON.parse(rawText) : null;
  } catch {
    data = null;
  }

  console.log("[ÜTS] fetchUtsKurumNoByVKN → CEVAP", {
    url,
    status: response.status,
    ok: response.ok,
    responseText: rawText.slice(0, 4000),
    responseJson: data,
  });

  if (!response.ok) {
    const parsedMessage = extractUtsErrorMessage(data);
    if (parsedMessage) {
      throw new Error(`ÜTS Kurum Sorgulama Hatası: ${parsedMessage}`);
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        "ÜTS Kurum Sorgulama Hatası: Token geçersiz veya süresi dolmuş (HTTP " +
          response.status +
          ").",
      );
    }
    throw new Error(`ÜTS Kurum Sorgulama Hatası: HTTP ${response.status}`);
  }

  const payload = data as {
    SNC?:
      | Array<{ KRN?: number | string; DRM?: string; GAD?: string }>
      | { KRN?: number | string; DRM?: string }
      | null;
    MSJ?: UtsMessage[];
  } | null;

  const businessError = extractUtsErrorMessage(payload);
  if (
    businessError &&
    (payload?.MSJ ?? []).some((m) => (m.TIP ?? "").toUpperCase() === "HATA")
  ) {
    const lower = businessError.toLocaleLowerCase("tr-TR");
    const notFound =
      lower.includes("bulunamadı") ||
      lower.includes("bulunamadi") ||
      lower.includes("kayıt");
    if (!notFound) {
      throw new Error(`ÜTS Kurum Sorgulama Hatası: ${businessError}`);
    }
  }

  const rows = Array.isArray(payload?.SNC)
    ? payload.SNC
    : payload?.SNC
      ? [payload.SNC]
      : [];

  if (rows.length === 0) {
    throw new Error(
      "Bu VKN / TCKN ile ÜTS'de kayıtlı bir kurum bulunamadı.",
    );
  }

  const aktif =
    rows.find((r) => (r.DRM ?? "AKTIF").toUpperCase() === "AKTIF") ?? rows[0];
  const kurumRaw = aktif?.KRN;
  if (kurumRaw === undefined || kurumRaw === null || kurumRaw === "") {
    throw new Error(
      "Bu VKN / TCKN ile ÜTS'de kayıtlı bir kurum bulunamadı.",
    );
  }

  const kurumNumarasi = String(kurumRaw).trim();
  if (!kurumNumarasi) {
    throw new Error(
      "Bu VKN / TCKN ile ÜTS'de kayıtlı bir kurum bulunamadı.",
    );
  }

  return kurumNumarasi;
}

function extractUtsErrorMessage(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;

  const direct =
    (typeof obj.mesaj === "string" && obj.mesaj.trim()) ||
    (typeof obj.message === "string" && obj.message.trim()) ||
    (typeof obj.hataMesaji === "string" && obj.hataMesaji.trim()) ||
    (typeof obj.error === "string" && obj.error.trim()) ||
    (typeof obj.MET === "string" && obj.MET.trim()) ||
    null;
  if (direct) return direct;

  const msj = obj.MSJ;
  if (Array.isArray(msj) && msj.length > 0) {
    const messages = msj as UtsMessage[];
    const hatalar = messages.filter(
      (m) => (m.TIP ?? "").toUpperCase() === "HATA",
    );
    const kaynak = hatalar.length > 0 ? hatalar : messages;
    const metinler = kaynak
      .map((m) => m.MET?.trim())
      .filter((m): m is string => Boolean(m));
    if (metinler.length > 0) return metinler.join(" · ");
  }

  return null;
}

function isBildirimSuccess(data: UtsBildirimResponse | null): boolean {
  if (!data) return false;
  const hasHata = (data.MSJ ?? []).some(
    (m) => (m.TIP ?? "").toUpperCase() === "HATA",
  );
  if (hasHata) return false;
  return Boolean(data.SNC && String(data.SNC).trim());
}

/**
 * Alma bildirimi — gerçek ÜTS HTTP isteği.
 * Endpoint: {UTS_API_URL}/bildirim/alma
 * Resmi rota: /UTS/uh/rest/bildirim/alma/ekle (VBI + opsiyonel ADT)
 */
export async function sendAlmaBildirimi(
  payload: AlmaBildirimiPayload,
): Promise<SendAlmaBildirimiResult> {
  const { token, apiUrl } = getUtsConfig();
  const vermeBildirimId = payload.vermeBildirimId?.trim() ?? "";

  if (!token) {
    throw new Error(
      "ÜTS yapılandırması eksik: UTS_TOKEN tanımlı değil. Lütfen sistem yöneticisine bildirin.",
    );
  }

  if (!vermeBildirimId) {
    throw new Error(
      "Verme Bildirim ID (VBI) eksik. Alma bildirimi için karşı tarafın verme bildirimi kimliği gerekli.",
    );
  }

  const url = `${apiUrl}/bildirim/alma`;
  const body: { VBI: string; ADT?: number } = {
    VBI: vermeBildirimId,
  };

  if (payload.miktar != null && Number.isFinite(Number(payload.miktar))) {
    const adt = Math.max(1, Math.round(Number(payload.miktar)));
    body.ADT = adt;
  }

  const payloadJson = JSON.stringify(body);

  console.log("[ÜTS] sendAlmaBildirimi → İSTEK", {
    url,
    payload: body,
    payloadJson,
  });

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: payloadJson,
      cache: "no-store",
    });
  } catch (networkError) {
    console.error("[ÜTS] sendAlmaBildirimi → AĞ HATASI", {
      url,
      payload: body,
      networkError,
    });
    throw new Error(
      "ÜTS sunucusuna ulaşılamadı. İnternet bağlantınızı kontrol edin veya daha sonra tekrar deneyin.",
    );
  }

  const rawText = await response.text();
  let errorData: unknown = null;
  try {
    errorData = rawText ? JSON.parse(rawText) : null;
  } catch {
    errorData = null;
  }

  console.log("[ÜTS] sendAlmaBildirimi → CEVAP", {
    url,
    status: response.status,
    ok: response.ok,
    responseText: rawText.slice(0, 4000),
    responseJson: errorData,
  });

  if (!response.ok) {
    const parsedMessage = extractUtsErrorMessage(errorData);
    if (parsedMessage) {
      throw new Error(`ÜTS Hatası: ${parsedMessage}`);
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        "ÜTS Hatası: Token geçersiz veya süresi dolmuş (HTTP " +
          response.status +
          "). UTS_TOKEN değerini kontrol edin.",
      );
    }
    if (response.status === 400) {
      throw new Error(
        "ÜTS Hatası: Gönderilen veri geçersiz (HTTP 400). Verme Bildirim ID (VBI) ve adedi kontrol edin.",
      );
    }
    throw new Error(`ÜTS Sunucu Hatası: ${response.status}`);
  }

  const data = errorData as UtsBildirimResponse | null;
  const businessError = extractUtsErrorMessage(data);
  if (businessError || !isBildirimSuccess(data)) {
    throw new Error(
      `ÜTS Hatası: ${businessError ?? "Alma bildirimi başarısız oldu (SNC boş veya HATA mesajı)."}`,
    );
  }

  return {
    success: true,
    notificationId: data?.SNC ? String(data.SNC).trim() : undefined,
  };
}

/**
 * Verme bildirimi — gerçek ÜTS HTTP isteği.
 * Endpoint: {UTS_API_URL}/bildirim/verme
 * Hata durumunda okunabilir mesajla Error fırlatır.
 */
export async function sendVermeBildirimi(
  payload: VermeBildirimiPayload,
): Promise<{ success: true; notificationId?: string }> {
  const { token, firmNo, apiUrl } = getUtsConfig();
  const gonderenKurumNo = payload.gonderenKurumNo?.trim() || firmNo;
  const alanKurumNo = payload.alanKurumNo?.trim() ?? "";

  if (!token) {
    throw new Error(
      "ÜTS yapılandırması eksik: UTS_TOKEN tanımlı değil. Lütfen sistem yöneticisine bildirin.",
    );
  }

  if (!gonderenKurumNo) {
    throw new Error(
      "ÜTS yapılandırması eksik: UTS_FIRM_NO (gönderen kurum no) tanımlı değil. Lütfen sistem yöneticisine bildirin.",
    );
  }

  if (!alanKurumNo) {
    throw new Error(
      "ÜTS Kurum No eksik. Lütfen müşteri kartından VKN ile sorgulatarak ekleyin.",
    );
  }

  if (!payload.urunBarkodu?.trim()) {
    throw new Error(
      "Ürün barkodu eksik. Ürün kartına barkod ekleyin veya referans kodunu kontrol edin.",
    );
  }

  if (!payload.belgeNo?.trim()) {
    throw new Error(
      "Fatura / belge numarası eksik. Bu stok kalemine bağlı faturayı kontrol edin.",
    );
  }

  if (!payload.lotBrcNo?.trim()) {
    throw new Error("Lot numarası eksik. Stok kalemini kontrol edin.");
  }

  const miktar = Math.max(1, Number(payload.miktar) || 1);
  const url = `${apiUrl}/bildirim/verme`;

  const body = {
    gonderenKurumNo,
    alanKurumNo,
    urunBarkodu: payload.urunBarkodu.trim(),
    lotBrcNo: payload.lotBrcNo.trim(),
    miktar,
    belgeNo: payload.belgeNo.trim().slice(0, 50),
    UNO: payload.urunBarkodu.trim(),
    LNO: payload.lotBrcNo.trim().slice(0, 20),
    ADT: miktar,
    BNO: payload.belgeNo.trim().slice(0, 50),
    KUN: Number.isFinite(Number(alanKurumNo))
      ? Number(alanKurumNo)
      : alanKurumNo,
    BEN: "HAYIR",
  };

  const payloadJson = JSON.stringify(body);

  console.log("[ÜTS] sendVermeBildirimi → İSTEK", {
    url,
    payload: body,
    payloadJson,
  });

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: payloadJson,
      cache: "no-store",
    });
  } catch (networkError) {
    console.error("[ÜTS] sendVermeBildirimi → AĞ HATASI", {
      url,
      payload: body,
      networkError,
    });
    throw new Error(
      "ÜTS sunucusuna ulaşılamadı. İnternet bağlantınızı kontrol edin veya daha sonra tekrar deneyin.",
    );
  }

  const rawText = await response.text();
  let errorData: unknown = null;
  try {
    errorData = rawText ? JSON.parse(rawText) : null;
  } catch {
    errorData = null;
  }

  console.log("[ÜTS] sendVermeBildirimi → CEVAP", {
    url,
    status: response.status,
    ok: response.ok,
    responseText: rawText.slice(0, 4000),
    responseJson: errorData,
  });

  if (!response.ok) {
    const parsedMessage = extractUtsErrorMessage(errorData);
    if (parsedMessage) {
      throw new Error(`ÜTS Hatası: ${parsedMessage}`);
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        "ÜTS Hatası: Token geçersiz veya süresi dolmuş (HTTP " +
          response.status +
          "). UTS_TOKEN değerini kontrol edin.",
      );
    }
    if (response.status === 400) {
      throw new Error(
        "ÜTS Hatası: Gönderilen veri geçersiz (HTTP 400). Kurum no, barkod, lot veya belge numarasını kontrol edin.",
      );
    }
    throw new Error(`ÜTS Sunucu Hatası: ${response.status}`);
  }

  const data = errorData as UtsBildirimResponse | null;
  const businessError = extractUtsErrorMessage(data);
  if (businessError || !isBildirimSuccess(data)) {
    throw new Error(
      `ÜTS Hatası: ${businessError ?? "Bildirim başarısız oldu (SNC boş veya HATA mesajı)."}`,
    );
  }

  return {
    success: true,
    notificationId: data?.SNC ? String(data.SNC).trim() : undefined,
  };
}
