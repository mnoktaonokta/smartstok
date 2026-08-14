/**
 * GİB “İlaç ve Tıbbi Cihaz Teslimlerine İlişkin Fatura Teknik Kılavuzu” V1.2
 * Tıbbi cihaz AdditionalItemIdentification (schemeID=TIBBICIHAZ) üretimi.
 *
 * Örnek (serili): (UNO)…(LNO)…(SNO)…(URT)YYMMDD
 * Örnek (yalnızca parti): (UNO)…(LNO)…(URT)YYMMDD  — SNO yazılmaz
 */

export type TibbiCihazUnit = {
  /** Ürün numarası / barkod / GTIN */
  uno: string;
  /** Lot / parti */
  lno: string;
  /** Seri — yoksa (yalnızca parti takibi) eklenmez */
  sno?: string | null;
  /** Üretim tarihi */
  productionDate?: Date | null;
  /**
   * SKT varsa ve üretim tarihi yoksa: uygulamadaki GS1 kuralı (SKT = URT + 5 yıl)
   * ile URT türetilir.
   */
  expiryDate?: Date | null;
};

/** GİB örneklerindeki URT formatı: YYMMDD */
export function formatUrtYymmdd(date: Date): string {
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

/**
 * Üretim tarihi: kayıtlı productionDate, yoksa SKT − 5 yıl (mal kabul GS1 varsayımı).
 */
export function resolveProductionDate(unit: TibbiCihazUnit): Date | null {
  if (unit.productionDate && !Number.isNaN(unit.productionDate.getTime())) {
    return unit.productionDate;
  }
  if (unit.expiryDate && !Number.isNaN(unit.expiryDate.getTime())) {
    const d = new Date(unit.expiryDate);
    d.setFullYear(d.getFullYear() - 5);
    return d;
  }
  return null;
}

export function buildTibbiCihazIdentificationId(
  unit: TibbiCihazUnit,
): { ok: true; id: string } | { ok: false; error: string } {
  const uno = unit.uno.trim();
  const lno = unit.lno.trim();
  if (!uno) {
    return { ok: false, error: "UNO (barkod) eksik." };
  }
  if (!lno) {
    return { ok: false, error: "LNO (lot) eksik." };
  }
  const production = resolveProductionDate(unit);
  if (!production) {
    return {
      ok: false,
      error:
        "URT (üretim tarihi) eksik. Mal kabulde karekod/SKT ile kayıt gerekli.",
    };
  }
  const urt = formatUrtYymmdd(production);
  const sno = unit.sno?.trim();
  const id = sno
    ? `(UNO)${uno}(LNO)${lno}(SNO)${sno}(URT)${urt}`
    : `(UNO)${uno}(LNO)${lno}(URT)${urt}`;
  return { ok: true, id };
}

export function buildTibbiCihazIdentificationIds(
  units: TibbiCihazUnit[],
): { ok: true; ids: string[] } | { ok: false; error: string } {
  const ids: string[] = [];
  for (const unit of units) {
    const built = buildTibbiCihazIdentificationId(unit);
    if (!built.ok) return built;
    ids.push(built.id);
  }
  return { ok: true, ids };
}
