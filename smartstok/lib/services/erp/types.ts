/**
 * Ortak ERP DTO’ları — sağlayıcıdan bağımsız.
 */

export type ErpCustomer = {
  externalId: string;
  code: string | null;
  name: string;
  vknTckn: string;
  taxOffice: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
};

export type ErpAbstractLine = {
  date: string;
  type: string;
  note: string;
  debit: number;
  credit: number;
  balance: number;
  payment?: string;
};

export type ErpAbstract = {
  title: string;
  email?: string;
  phone?: string;
  balance: number;
  debitSum: number;
  creditSum: number;
  link?: string;
  lines: ErpAbstractLine[];
};

export type SyncCustomersResult =
  | { ok: true; customers: ErpCustomer[] }
  | { ok: false; error: string };

export type GetCustomerAbstractResult =
  | { ok: true; data: ErpAbstract }
  | { ok: false; error: string };

export type DraftInvoiceData = {
  invoiceNo: string;
  note?: string;
  invoiceDate: string;
  dueDate: string;
  deliveryDate?: string;
  customer: {
    id: string;
    title: string;
    address?: string;
    taxOffice?: string;
    taxNo?: string;
    phone?: string;
    email?: string;
    externalId?: string | null;
  };
  amounts: {
    currency: string;
    gross: number;
    discount: number;
    net: number;
    tax: number;
    total: number;
  };
  lines: Array<{
    productId: string;
    productName: string;
    note?: string;
    barcode?: string;
    taxRate: number;
    quantity: number;
    unitPrice: number;
    gross: number;
    discount: number;
    net: number;
    tax: number;
    total: number;
  }>;
};

export type CreateDraftInvoiceResult =
  | { ok: true; guid: string; url?: string | null }
  | { ok: false; error: string };
