export function formatProductSize(
  diameter?: number | null,
  length?: number | null,
) {
  if (diameter != null && length != null) {
    return `${diameter}x${length}`;
  }
  if (diameter != null) return `Ø${diameter}`;
  if (length != null) return `L${length}`;
  return null;
}

export function formatProductLabel(input: {
  referenceCode: string;
  name: string;
  diameter?: number | null;
  length?: number | null;
  totalCount: number;
}) {
  const size = formatProductSize(input.diameter, input.length);
  const sizePart = size ? ` (${size})` : "";
  return `${input.referenceCode} Kodlu ${input.name}${sizePart} - Toplam ${input.totalCount} Adet`;
}
