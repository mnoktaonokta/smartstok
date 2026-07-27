/**
 * VKN/TCKN sorgu servisi — otomatik ünvan sorgusu kaldırıldı.
 * Yeni müşteri formu alanları manuel doldurulur.
 * İleride GİB / e-Fatura entegrasyonu buraya eklenebilir.
 */

export type VknLookupResult = {
  vknTckn: string;
  name: string;
  taxOffice: string;
  address: string;
  phone?: string;
};

export async function lookupVkn(
  _vknTckn: string,
): Promise<VknLookupResult | null> {
  return null;
}
