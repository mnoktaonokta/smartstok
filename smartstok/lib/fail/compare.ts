export type ExcessLine = {
  productId: string;
  quantity: number;
};

export type SupplierReceiptCompare =
  | { kind: "exact"; message: string }
  | { kind: "swap"; message: string }
  | { kind: "partial"; message: string }
  | { kind: "over"; message: string }
  | {
      kind: "excess_swap";
      message: string;
      surpluses: ExcessLine[];
      replaceCandidates: ExcessLine[];
    };

function countByProduct(lines: Array<{ productId: string; quantity: number }>) {
  const map = new Map<string, number>();
  for (const l of lines) {
    map.set(l.productId, (map.get(l.productId) ?? 0) + l.quantity);
  }
  return map;
}

export function compareSupplierReceipt(
  expected: Array<{ productId: string; quantity: number }>,
  received: Array<{ productId: string; quantity: number }>,
): SupplierReceiptCompare {
  const exp = countByProduct(expected);
  const rec = countByProduct(received);
  const expTotal = [...exp.values()].reduce((a, b) => a + b, 0);
  const recTotal = [...rec.values()].reduce((a, b) => a + b, 0);

  const allIds = new Set([...exp.keys(), ...rec.keys()]);
  const surpluses: ExcessLine[] = [];
  const deficits: ExcessLine[] = [];

  for (const id of allIds) {
    const e = exp.get(id) ?? 0;
    const r = rec.get(id) ?? 0;
    if (r > e) surpluses.push({ productId: id, quantity: r - e });
    if (e > r) deficits.push({ productId: id, quantity: e - r });
  }

  let sameMix = exp.size === rec.size && surpluses.length === 0 && deficits.length === 0;
  if (sameMix) {
    for (const [id, qty] of exp) {
      if (rec.get(id) !== qty) {
        sameMix = false;
        break;
      }
    }
  }

  if (sameMix && expTotal === recTotal) {
    return {
      kind: "exact",
      message: "İstek talebi tedarikçiden tam olarak karşılanmış.",
    };
  }

  const surplusTotal = surpluses.reduce((s, x) => s + x.quantity, 0);
  const deficitTotal = deficits.reduce((s, x) => s + x.quantity, 0);

  // Fazla gelen ürün + listede karşılanmayan başka ürün → değiştirme teklifi
  if (surplusTotal > 0 && deficitTotal > 0) {
    return {
      kind: "excess_swap",
      message:
        "Bu üründen beklenenden fazla geldi. Ya yanlış girildi, ya da listedeki başka bir ürünün yerine bu fazlalık gönderilmiş olabilir. Listedeki bir ürünle değiştirmek ister misiniz?",
      surpluses,
      replaceCandidates: deficits,
    };
  }

  if (recTotal === expTotal && !sameMix) {
    return {
      kind: "swap",
      message:
        "İstediğinizden farklı ürünler gelmiş fakat adetler tutarlı. Stoğa ekleyeyim mi?",
    };
  }

  if (recTotal < expTotal) {
    return {
      kind: "partial",
      message: "Talep edilen ürün sayısı karşılanmadı.",
    };
  }

  if (surplusTotal > 0) {
    return {
      kind: "over",
      message:
        "Bu üründen beklenenden fazla girdiniz. Adedi düzeltin; listede yerine sayılabilecek başka bekleyen ürün yok.",
    };
  }

  return {
    kind: "over",
    message: "Gelen ürün sayısı beklenenden fazla. Fazlaları ayıklayın.",
  };
}
