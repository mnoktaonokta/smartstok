/** Bizim Hesap cari ekstre DTO’ları — client/server ortak tipler (secrets yok). */

export type BizimHesapAbstractLine = {
  date: string;
  type: string;
  note: string;
  debit: number;
  credit: number;
  balance: number;
  payment?: string;
};

export type BizimHesapAbstract = {
  title: string;
  email?: string;
  phone?: string;
  balance: number;
  debitSum: number;
  creditSum: number;
  link?: string;
  lines: BizimHesapAbstractLine[];
};

export type GetCustomerAbstractResult =
  | { ok: true; data: BizimHesapAbstract }
  | { ok: false; error: string };

/** Bizim Hesap müşteri listesi → SmartStok Customer map */
export type BizimHesapCustomerMapped = {
  bizimHesapId: string;
  code: string | null;
  name: string;
  vknTckn: string;
  taxOffice: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
};

export type GetAllCustomersResult =
  | { ok: true; customers: BizimHesapCustomerMapped[] }
  | { ok: false; error: string };
