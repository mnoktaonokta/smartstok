/** Sık kullanılan kategori önerileri (değer = kaydedilen metin) */
export const CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: "İmplant", label: "İmplant" },
  { value: "Abutment", label: "Abutment" },
  { value: "Ara Parça", label: "Ara Parça" },
];

export function categoryLabel(category: string) {
  return (
    CATEGORY_OPTIONS.find((c) => c.value === category)?.label ?? category
  );
}
