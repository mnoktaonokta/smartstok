/** Cari ekstre DTO’ları — client/server ortak. */

export type {
  ErpAbstract as BizimHesapAbstract,
  ErpAbstractLine as BizimHesapAbstractLine,
} from "@/lib/services/erp/types";

export type { GetCustomerAbstractResult } from "@/lib/services/erp/types";

/** @deprecated ErpCustomer tercih edin — geriye dönük alan adı */
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
