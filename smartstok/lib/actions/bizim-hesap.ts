"use server";

/**
 * Bizim Hesap Server Actions — yalnızca sunucuda çalışır.
 */

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { assertCanMutate, mutationDeniedMessage } from "@/lib/roles";
import {
  getAllCustomers,
  getCustomerAbstract,
  type BizimHesapAbstract,
} from "@/lib/services/bizimHesapService";

export type CustomerAbstractActionResult = {
  error?: string;
  data?: BizimHesapAbstract;
};

/**
 * Müşterinin Bizim Hesap cari ekstresini sunucu tarafında çeker.
 */
export async function getCustomerAbstractAction(
  customerId: string,
): Promise<CustomerAbstractActionResult> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { error: "Oturum bulunamadı." };
    }

    if (!customerId?.trim()) {
      return { error: "Geçersiz müşteri." };
    }

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { bizimHesapId: true, name: true },
    });

    if (!customer) {
      return { error: "Müşteri bulunamadı." };
    }

    if (!customer.bizimHesapId?.trim()) {
      return {
        error:
          "Bu müşteri için Bizim Hesap cari kodu (bizimHesapId) tanımlı değil. Müşteri kartından ekleyin.",
      };
    }

    console.info("[getCustomerAbstractAction] İstek", {
      smartStokCustomerId: customerId,
      bizimHesapCariKod: customer.bizimHesapId,
      hasToken: Boolean(process.env.BIZIMHESAP_TOKEN?.trim()),
      hasFirmId: Boolean(process.env.BIZIMHESAP_FIRM_ID?.trim()),
    });

    const result = await getCustomerAbstract(customer.bizimHesapId.trim());

    if (!result.ok) {
      console.error("[getCustomerAbstractAction] Servis hatası", {
        error: result.error,
        customerId,
        bizimHesapId: customer.bizimHesapId,
      });
      return { error: result.error };
    }

    return { data: result.data };
  } catch (error) {
    console.error("[getCustomerAbstractAction] Beklenmeyen hata", error);
    return { error: "Cari ekstre alınırken bir hata oluştu." };
  }
}

export type SyncCustomersResult = {
  error?: string;
  added?: number;
  updated?: number;
  skipped?: number;
  message?: string;
};

/**
 * Bizim Hesap müşterilerini SmartStok’a senkronize eder (upsert).
 * Eşleşme: bizimHesapId → yoksa VKN/TCKN.
 * Yeni kayıtlarda konsinye deposu da oluşturulur.
 */
export async function syncCustomersFromBizimHesapAction(): Promise<SyncCustomersResult> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { error: "Oturum bulunamadı." };
    }
    assertCanMutate(session.user.roles);

    const api = await getAllCustomers();
    if (!api.ok) {
      return { error: api.error };
    }

    let added = 0;
    let updated = 0;
    let skipped = 0;

    for (const remote of api.customers) {
      const vkn = remote.vknTckn;
      const hasValidVkn = /^\d{10,11}$/.test(vkn);

      if (!hasValidVkn) {
        skipped += 1;
        console.warn("[syncCustomers] VKN eksik/geçersiz, atlandı", {
          bizimHesapId: remote.bizimHesapId,
          name: remote.name,
          vkn,
        });
        continue;
      }

      const existingByBh = await prisma.customer.findFirst({
        where: { bizimHesapId: remote.bizimHesapId },
        include: { locations: { where: { type: "CLINIC_DEPOT" }, take: 1 } },
      });

      const existingByVkn = existingByBh
        ? null
        : await prisma.customer.findUnique({
            where: { vknTckn: vkn },
            include: {
              locations: { where: { type: "CLINIC_DEPOT" }, take: 1 },
            },
          });

      const existing = existingByBh ?? existingByVkn;

      if (existing) {
        await prisma.customer.update({
          where: { id: existing.id },
          data: {
            name: remote.name,
            taxOffice: remote.taxOffice,
            address: remote.address,
            phone: remote.phone,
            bizimHesapId: remote.bizimHesapId,
          },
        });

        if (existing.locations.length === 0) {
          await prisma.location.create({
            data: {
              name: `${remote.name} Konsinye Deposu`,
              type: "CLINIC_DEPOT",
              customerId: existing.id,
            },
          });
        } else {
          await prisma.location.update({
            where: { id: existing.locations[0].id },
            data: { name: `${remote.name} Konsinye Deposu` },
          });
        }

        updated += 1;
        continue;
      }

      await prisma.$transaction(async (tx) => {
        const created = await tx.customer.create({
          data: {
            vknTckn: vkn,
            name: remote.name,
            taxOffice: remote.taxOffice,
            address: remote.address,
            phone: remote.phone,
            bizimHesapId: remote.bizimHesapId,
            assignedUserId: null, // Admin dağıtır
          },
        });

        await tx.location.create({
          data: {
            name: `${remote.name} Konsinye Deposu`,
            type: "CLINIC_DEPOT",
            customerId: created.id,
          },
        });
      });

      added += 1;
    }

    revalidatePath("/dashboard/customers");
    revalidatePath("/dashboard/transfers");
    revalidatePath("/dashboard/invoices/new");

    const parts: string[] = [];
    if (added > 0) parts.push(`${added} eklendi`);
    if (updated > 0) parts.push(`${updated} güncellendi`);
    if (skipped > 0) parts.push(`${skipped} atlandı (VKN yok)`);

    return {
      added,
      updated,
      skipped,
      message:
        parts.length > 0
          ? `${parts.join(", ")}.`
          : "Senkronize edilecek müşteri bulunamadı.",
    };
  } catch (error) {
    const denied = mutationDeniedMessage(error);
    if (denied) return { error: denied };
    console.error("[syncCustomersFromBizimHesapAction]", error);
    return { error: "Müşteri senkronizasyonu sırasında bir hata oluştu." };
  }
}
