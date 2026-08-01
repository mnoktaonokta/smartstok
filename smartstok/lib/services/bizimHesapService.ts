/**
 * @deprecated ErpFactory / BizimHesapAdapter kullanın.
 * Geriye dönük ince sarmalayıcı.
 */
import "server-only";

import { ErpFactory } from "@/lib/services/erp/ErpFactory";
import type {
  GetAllCustomersResult,
  GetCustomerAbstractResult,
} from "@/lib/services/bizimHesapTypes";

export type {
  BizimHesapAbstract,
  BizimHesapAbstractLine,
  BizimHesapCustomerMapped,
  GetAllCustomersResult,
  GetCustomerAbstractResult,
} from "@/lib/services/bizimHesapTypes";

export async function getCustomerAbstract(
  customerId: string,
): Promise<GetCustomerAbstractResult> {
  const erp = await ErpFactory.getInstance();
  return erp.getCustomerAbstract(customerId);
}

export async function getAllCustomers(): Promise<GetAllCustomersResult> {
  const erp = await ErpFactory.getInstance();
  const result = await erp.syncCustomers();
  if (!result.ok) return result;
  return {
    ok: true,
    customers: result.customers.map((c) => ({
      bizimHesapId: c.externalId,
      code: c.code,
      name: c.name,
      vknTckn: c.vknTckn,
      taxOffice: c.taxOffice,
      address: c.address,
      phone: c.phone,
      email: c.email,
    })),
  };
}
