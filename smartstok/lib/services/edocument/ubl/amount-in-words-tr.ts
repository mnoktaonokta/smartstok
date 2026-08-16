/** Fatura “YALNIZ” satırı — tutarı Türkçe yazıya çevirir. */

const ONES = [
  "",
  "BİR",
  "İKİ",
  "ÜÇ",
  "DÖRT",
  "BEŞ",
  "ALTI",
  "YEDİ",
  "SEKİZ",
  "DOKUZ",
];
const TENS = [
  "",
  "ON",
  "YİRMİ",
  "OTUZ",
  "KIRK",
  "ELLİ",
  "ALTMIŞ",
  "YETMİŞ",
  "SEKSEN",
  "DOKSAN",
];

function threeDigits(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const tens = Math.floor(rest / 10);
  const ones = rest % 10;
  let out = "";
  if (hundreds > 0) {
    out += (hundreds === 1 ? "" : ONES[hundreds]!) + "YÜZ";
  }
  out += TENS[tens]! + ONES[ones]!;
  return out;
}

function integerToWords(n: number): string {
  if (n === 0) return "SIFIR";
  const groups = [
    { value: 1_000_000_000, label: "MİLYAR" },
    { value: 1_000_000, label: "MİLYON" },
    { value: 1_000, label: "BİN" },
    { value: 1, label: "" },
  ];
  let remaining = n;
  let out = "";
  for (const g of groups) {
    const qty = Math.floor(remaining / g.value);
    remaining %= g.value;
    if (qty === 0) continue;
    if (g.value === 1_000 && qty === 1) {
      out += "BİN";
    } else {
      out += threeDigits(qty) + g.label;
    }
  }
  return out || "SIFIR";
}

export function amountInTurkishWords(amount: number): string {
  const rounded = Math.round(Math.max(0, amount) * 100) / 100;
  const tl = Math.floor(rounded + 1e-9);
  const kurus = Math.round((rounded - tl) * 100);
  const parts = [`${integerToWords(tl)} TL`];
  if (kurus > 0) {
    parts.push(`${threeDigits(kurus)} KURUŞ`);
  }
  return parts.join(" ");
}
