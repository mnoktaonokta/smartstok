/**
 * Bizim Hesap API tutar formatı: "2,400.00" (binlik virgül, ondalık nokta)
 */
export function formatBizimHesapAmount(value: number): string {
  const fixed = value.toFixed(2);
  const [intPart, decPart] = fixed.split(".");
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${withThousands}.${decPart}`;
}

export type BizimHesapInvoicePayload = {
  firmId: string;
  invoiceNo?: string;
  invoiceType: number;
  note?: string;
  dates: {
    invoiceDate: string;
    dueDate: string;
    deliveryDate?: string;
  };
  customer: {
    customerId: string;
    title: string;
    address?: string;
    taxOffice?: string;
    taxNo?: string;
    email?: string;
    phone?: string;
  };
  amounts: {
    currency: string;
    gross: string;
    discount: string;
    net: string;
    tax: string;
    total: string;
  };
  details: Array<{
    productId: string;
    productName: string;
    note?: string;
    barcode?: string;
    taxRate: string;
    quantity: number;
    unitPrice: string;
    grossPrice: string;
    discount: string;
    net: string;
    tax: string;
    total: string;
  }>;
};

export type BizimHesapInvoiceResponse = {
  error?: string;
  guid?: string;
  url?: string;
};

export async function postBizimHesapInvoice(
  payload: BizimHesapInvoicePayload,
): Promise<BizimHesapInvoiceResponse> {
  const res = await fetch("https://bizimhesap.com/api/b2b/addinvoice", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let data: BizimHesapInvoiceResponse = {};

  try {
    data = JSON.parse(text) as BizimHesapInvoiceResponse;
  } catch {
    return {
      error: `Bizim Hesap yanıtı okunamadı (${res.status}): ${text.slice(0, 200)}`,
    };
  }

  if (!res.ok && !data.error) {
    return { error: `Bizim Hesap HTTP ${res.status}` };
  }

  return data;
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
