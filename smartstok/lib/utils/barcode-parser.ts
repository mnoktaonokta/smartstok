/**
 * Standart EAN ve GS1 DataMatrix (Karekod) ayrıştırıcı.
 *
 * Örnek karekod: 01086850596032221125111910P25031119M0100
 * - 01 + 14 hane GTIN → EAN (baştaki 0 atılırsa 13 hane): 8685059603222
 * - 11 + YYMMDD üretim tarihi → SKT = üretim + 5 yıl (DD.MM.YYYY)
 * - 10 + kalan → Lot
 */

export type BarcodeParseResult = {
  type: "EAN" | "QR";
  barkod: string;
  lot?: string;
  /** Son kullanma tarihi — DD.MM.YYYY */
  skt?: string;
};

/** DD.MM.YYYY → YYYY-MM-DD (HTML date input için) */
export function sktToDateInputValue(skt: string | undefined): string {
  if (!skt) return "";
  const m = skt.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return "";
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** Yalnızca barkod numarasını çıkarır (lot/SKT yok sayılır). */
export function extractBarcodeOnly(raw: string): string {
  return parseBarcode(raw).barkod;
}

function formatSktFromProductionYymmdd(yymmdd: string): string | undefined {
  if (!/^\d{6}$/.test(yymmdd)) return undefined;
  const yy = Number(yymmdd.slice(0, 2));
  const mm = Number(yymmdd.slice(2, 4));
  const dd = Number(yymmdd.slice(4, 6));
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return undefined;

  // 00–79 → 2000–2079, 80–99 → 1980–1999 (GS1 yaygın kuralı)
  const fullYear = yy >= 80 ? 1900 + yy : 2000 + yy;
  const sktYear = fullYear + 5;

  const d = String(dd).padStart(2, "0");
  const m = String(mm).padStart(2, "0");
  return `${d}.${m}.${sktYear}`;
}

function normalizeGtinToEan(gtin14: string): string {
  const digits = gtin14.replace(/\D/g, "");
  if (digits.length === 14 && digits.startsWith("0")) {
    return digits.slice(1);
  }
  if (digits.length === 13 || digits.length === 14) {
    return digits;
  }
  return digits;
}

function parseParenthesesGs1(raw: string): BarcodeParseResult | null {
  const gtin =
    raw.match(/\(01\)(\d{14})/)?.[1] ??
    raw.match(/\(01\)(\d{13})/)?.[1];
  if (!gtin) return null;

  const prod = raw.match(/\(11\)(\d{6})/)?.[1];
  const lot = raw.match(/\(10\)([^\(]+)/)?.[1]?.trim();

  return {
    type: "QR",
    barkod: normalizeGtinToEan(gtin.padStart(14, "0").slice(-14)),
    lot: lot || undefined,
    skt: prod ? formatSktFromProductionYymmdd(prod) : undefined,
  };
}

/**
 * Sürekli GS1 (FNC1 yok): 01(14) … 11(6) … 10(variable)
 * Örnek: 01086850596032221125111910P25031119M0100
 */
function parseContinuousGs1(raw: string): BarcodeParseResult | null {
  // 01 + 14 hane zorunlu çekirdek
  const head = raw.match(/^01(\d{14})(.*)$/);
  if (!head) return null;

  const gtin14 = head[1];
  let rest = head[2] ?? "";
  let lot: string | undefined;
  let skt: string | undefined;

  // AI 11 — üretim tarihi (6 hane)
  const ai11 = rest.match(/^11(\d{6})(.*)$/);
  if (ai11) {
    skt = formatSktFromProductionYymmdd(ai11[1]);
    rest = ai11[2] ?? "";
  }

  // AI 17 — doğrudan SKT (varsa, 11'den sonra veya yerine)
  const ai17 = rest.match(/^17(\d{6})(.*)$/);
  if (ai17) {
    // Doğrudan son kullanma: YYMMDD → DD.MM.YYYY (+0 yıl)
    const yy = Number(ai17[1].slice(0, 2));
    const mm = ai17[1].slice(2, 4);
    const dd = ai17[1].slice(4, 6);
    const fullYear = yy >= 80 ? 1900 + yy : 2000 + yy;
    skt = `${dd}.${mm}.${fullYear}`;
    rest = ai17[2] ?? "";
  }

  // AI 10 — lot (kalan)
  const ai10 = rest.match(/^10(.+)$/);
  if (ai10) {
    lot = ai10[1].trim() || undefined;
  } else if (rest.startsWith("10")) {
    lot = rest.slice(2).trim() || undefined;
  }

  return {
    type: "QR",
    barkod: normalizeGtinToEan(gtin14),
    lot,
    skt,
  };
}

/**
 * Gelen string'i EAN veya GS1 Karekod olarak ayrıştırır.
 */
export function parseBarcode(raw: string): BarcodeParseResult {
  const original = String(raw ?? "").trim();
  if (!original) {
    return { type: "EAN", barkod: "" };
  }

  // GS1 / EAN analizi için boşluk ve FNC1 (GS) temizlenir
  const cleaned = original.replace(/[\s\u001d]/g, "");

  // Saf 13–14 haneli sayı → EAN
  if (/^\d{13,14}$/.test(cleaned)) {
    return {
      type: "EAN",
      barkod:
        cleaned.length === 14 && cleaned.startsWith("0")
          ? cleaned.slice(1)
          : cleaned,
    };
  }

  if (cleaned.includes("(01)")) {
    const paren = parseParenthesesGs1(cleaned);
    if (paren?.barkod) return paren;
  }

  if (cleaned.startsWith("01") && cleaned.length > 16) {
    const cont = parseContinuousGs1(cleaned);
    if (cont?.barkod) return cont;
  }

  // Tanınmayan metin: orijinal (trim) haliyle bırak — ürün adı araması bozulmasın
  return { type: "EAN", barkod: original };
}
