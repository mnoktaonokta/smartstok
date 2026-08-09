import "server-only";

import { prisma } from "@/lib/prisma";
import type { FailIntakeListItem } from "@/lib/fail/types";

/** Müşteriye ait fail alma kayıtları (depo / müşteri detay) */
export async function getCustomerFailIntakes(
  customerId: string,
): Promise<FailIntakeListItem[]> {
  if (!customerId) return [];

  const intakes = await prisma.failIntake.findMany({
    where: { customerId },
    include: {
      customer: { select: { id: true, name: true } },
      createdBy: { select: { fullName: true } },
      editedBy: { select: { fullName: true } },
      specs: true,
      givenItems: {
        include: {
          product: { select: { id: true, referenceCode: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return intakes.map((row) => {
    const givenMap = new Map<
      string,
      {
        productId: string;
        referenceCode: string;
        productName: string;
        quantity: number;
        disposition: "FAIL_HOLD" | "CONSIGNMENT_EXCESS";
      }
    >();
    let failHoldCount = 0;
    for (const g of row.givenItems) {
      if (g.disposition === "FAIL_HOLD") failHoldCount += 1;
      const key = `${g.productId}::${g.disposition}`;
      const prev = givenMap.get(key);
      if (prev) prev.quantity += 1;
      else {
        givenMap.set(key, {
          productId: g.productId,
          referenceCode: g.product.referenceCode,
          productName: g.product.name,
          quantity: 1,
          disposition: g.disposition,
        });
      }
    }
    return {
      id: row.id,
      customerId: row.customerId,
      customerName: row.customer.name,
      failCount: row.failCount,
      givenCount: row.givenItems.length,
      failHoldCount,
      creditQuantity: row.creditQuantity,
      createdAt: row.createdAt.toISOString(),
      createdByName: row.createdBy?.fullName ?? null,
      editedAt: row.editedAt?.toISOString() ?? null,
      editedByName: row.editedBy?.fullName ?? null,
      notes: row.notes,
      specs: row.specs.map((s) => ({
        id: s.id,
        diameter: s.diameter,
        length: s.length,
        lotNumber: s.lotNumber,
      })),
      givenProducts: Array.from(givenMap.values()),
    };
  });
}
