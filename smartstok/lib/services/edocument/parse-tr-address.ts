/**
 * Tek satırlık TR adresinden il / ilçe / PK çıkar.
 * “BAŞİSKELE/KOCAELİ” gibi son ekleri CityName=İstanbul varsayılanına düşürmez.
 */

type Il = { name: string; plate: string; aliases?: string[] };

const ILLER: Il[] = [
  { name: "Adana", plate: "01" },
  { name: "Adıyaman", plate: "02" },
  { name: "Afyonkarahisar", plate: "03", aliases: ["Afyon"] },
  { name: "Ağrı", plate: "04" },
  { name: "Amasya", plate: "05" },
  { name: "Ankara", plate: "06" },
  { name: "Antalya", plate: "07" },
  { name: "Artvin", plate: "08" },
  { name: "Aydın", plate: "09" },
  { name: "Balıkesir", plate: "10" },
  { name: "Bilecik", plate: "11" },
  { name: "Bingöl", plate: "12" },
  { name: "Bitlis", plate: "13" },
  { name: "Bolu", plate: "14" },
  { name: "Burdur", plate: "15" },
  { name: "Bursa", plate: "16" },
  { name: "Çanakkale", plate: "17" },
  { name: "Çankırı", plate: "18" },
  { name: "Çorum", plate: "19" },
  { name: "Denizli", plate: "20" },
  { name: "Diyarbakır", plate: "21" },
  { name: "Edirne", plate: "22" },
  { name: "Elazığ", plate: "23" },
  { name: "Erzincan", plate: "24" },
  { name: "Erzurum", plate: "25" },
  { name: "Eskişehir", plate: "26" },
  { name: "Gaziantep", plate: "27", aliases: ["Antep"] },
  { name: "Giresun", plate: "28" },
  { name: "Gümüşhane", plate: "29" },
  { name: "Hakkari", plate: "30" },
  { name: "Hatay", plate: "31" },
  { name: "Isparta", plate: "32" },
  { name: "Mersin", plate: "33", aliases: ["İçel"] },
  { name: "İstanbul", plate: "34", aliases: ["Istanbul"] },
  { name: "İzmir", plate: "35", aliases: ["Izmir"] },
  { name: "Kars", plate: "36" },
  { name: "Kastamonu", plate: "37" },
  { name: "Kayseri", plate: "38" },
  { name: "Kırklareli", plate: "39" },
  { name: "Kırşehir", plate: "40" },
  { name: "Kocaeli", plate: "41", aliases: ["İzmit"] },
  { name: "Konya", plate: "42" },
  { name: "Kütahya", plate: "43" },
  { name: "Malatya", plate: "44" },
  { name: "Manisa", plate: "45" },
  { name: "Kahramanmaraş", plate: "46", aliases: ["Maraş", "K.Maraş"] },
  { name: "Mardin", plate: "47" },
  { name: "Muğla", plate: "48" },
  { name: "Muş", plate: "49" },
  { name: "Nevşehir", plate: "50" },
  { name: "Niğde", plate: "51" },
  { name: "Ordu", plate: "52" },
  { name: "Rize", plate: "53" },
  { name: "Sakarya", plate: "54" },
  { name: "Samsun", plate: "55" },
  { name: "Siirt", plate: "56" },
  { name: "Sinop", plate: "57" },
  { name: "Sivas", plate: "58" },
  { name: "Tekirdağ", plate: "59" },
  { name: "Tokat", plate: "60" },
  { name: "Trabzon", plate: "61" },
  { name: "Tunceli", plate: "62" },
  { name: "Şanlıurfa", plate: "63", aliases: ["Urfa"] },
  { name: "Uşak", plate: "64" },
  { name: "Van", plate: "65" },
  { name: "Yozgat", plate: "66" },
  { name: "Zonguldak", plate: "67" },
  { name: "Aksaray", plate: "68" },
  { name: "Bayburt", plate: "69" },
  { name: "Karaman", plate: "70" },
  { name: "Kırıkkale", plate: "71" },
  { name: "Batman", plate: "72" },
  { name: "Şırnak", plate: "73" },
  { name: "Bartın", plate: "74" },
  { name: "Ardahan", plate: "75" },
  { name: "Iğdır", plate: "76" },
  { name: "Yalova", plate: "77" },
  { name: "Karabük", plate: "78" },
  { name: "Kilis", plate: "79" },
  { name: "Osmaniye", plate: "80" },
  { name: "Düzce", plate: "81" },
];

export type ParsedTrAddress = {
  street: string;
  district: string;
  city: string;
  postalZone: string;
};

function foldTr(value: string): string {
  return value
    .replace(/İ/g, "i")
    .replace(/I/g, "i")
    .replace(/ı/g, "i")
    .replace(/Ş/g, "s")
    .replace(/ş/g, "s")
    .replace(/Ğ/g, "g")
    .replace(/ğ/g, "g")
    .replace(/Ü/g, "u")
    .replace(/ü/g, "u")
    .replace(/Ö/g, "o")
    .replace(/ö/g, "o")
    .replace(/Ç/g, "c")
    .replace(/ç/g, "c")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const IL_INDEX = ILLER.flatMap((il) => {
  const names = [il.name, ...(il.aliases ?? [])];
  return names.map((n) => ({ key: foldTr(n), il }));
}).sort((a, b) => b.key.length - a.key.length);

function matchIl(raw: string): Il | null {
  const key = foldTr(raw);
  if (!key) return null;
  return IL_INDEX.find((row) => row.key === key)?.il ?? null;
}

function tidy(value: string): string {
  return value.replace(/^[\s,./-]+|[\s,./-]+$/g, "").replace(/\s+/g, " ");
}

function postalFor(il: Il | null, address: string): string {
  const m = address.match(/\b([0-8]\d{4})\b/);
  if (m?.[1] && m[1] !== "00000") return m[1];
  return il ? `${il.plate}000` : "";
}

export function parseTrAddress(
  raw: string | null | undefined,
  overrides?: { city?: string | null; district?: string | null },
): ParsedTrAddress {
  const address = (raw ?? "").replace(/\s+/g, " ").trim();
  const overrideCity = matchIl(overrides?.city ?? "");
  const overrideDistrict = tidy(overrides?.district ?? "");

  let cityIl = overrideCity;
  let district = overrideDistrict;
  let street = address;

  if (!cityIl && address) {
    const parts = address.split("/").map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const found = matchIl(parts[parts.length - 1] ?? "");
      if (found) {
        cityIl = found;
        const prev = parts[parts.length - 2] ?? "";
        const numbered = prev.match(/^(\d+)\s+(.+)$/);
        const head = parts.slice(0, -2);
        if (numbered) {
          if (!district) district = tidy(numbered[2] ?? "");
          street = tidy([...head, numbered[1]].join("/"));
        } else {
          const words = prev.split(/\s+/).filter(Boolean);
          if (words.length >= 2) {
            if (!district) district = words[words.length - 1] ?? "";
            street = tidy([...head, words.slice(0, -1).join(" ")].join("/"));
          } else {
            if (!district) district = tidy(prev);
            street = tidy(head.join("/"));
          }
        }
      }
    }
  }

  if (!cityIl && address) {
    const folded = foldTr(address);
    for (const row of IL_INDEX) {
      if (!folded.endsWith(row.key) && !folded.includes(` ${row.key}`)) continue;
      const idx = folded.lastIndexOf(row.key);
      if (idx < 0) continue;
      const before = folded[idx - 1];
      const after = folded[idx + row.key.length] ?? "";
      if (before && /[a-z0-9]/.test(before)) continue;
      if (after && /[a-z0-9]/.test(after)) continue;
      cityIl = row.il;
      const head = tidy(address.slice(0, idx)).replace(/[/,]\s*$/, "");
      street = head;
      break;
    }
  }

  return {
    street: street || (cityIl ? "" : address),
    district,
    city: cityIl?.name ?? tidy(overrides?.city ?? ""),
    postalZone: postalFor(cityIl, address),
  };
}
