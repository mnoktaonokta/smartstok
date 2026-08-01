/**
 * Bizim Hesap tutar formatı ve fatura satır hesapları (ERP’den bağımsız yardımcılar).
 */

/**
 * Bizim Hesap API tutar formatı: "2,400.00" (binlik virgül, ondalık nokta)
 */
export function formatBizimHesapAmount(value: number): string {
  const fixed = value.toFixed(2);
  const [intPart, decPart] = fixed.split(".");
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${withThousands}.${decPart}`;
}

export function calcLineAmounts(input: {
  unitPrice: number;
  quantity: number;
  discount: number;
  taxRate: number;
}) {
  const gross = input.unitPrice * input.quantity;
  const discount = Math.min(input.discount, gross);
  const net = Math.max(0, gross - discount);
  const tax = net * (input.taxRate / 100);
  const total = net + tax;

  return { gross, discount, net, tax, total };
}
