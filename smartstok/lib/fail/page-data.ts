import "server-only";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  ensureFailHoldDepot,
  ensureOpenFailCycle,
  ensureSupplierPendingDepot,
} from "@/lib/inventory";
import { customerPortfolioWhere } from "@/lib/portfolio";
import {
  canAccessFailManagement,
  canMutateData,
} from "@/lib/roles";
import type { UserRole } from "@/types/next-auth";
import type {
  FailAggLine,
  FailCustomerSummary,
  FailIntakeListItem,
  FailPageData,
  FailPendingLine,
} from "@/lib/fail/types";

/** RSC sayfa veri yükleyici — "use server" action değil */
export async function loadFailPageData(): Promise<{
  error?: string;
  data?: FailPageData;
}> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { error: "Oturum bulunamadı." };
    }

    const roles = session.user.roles as UserRole[];
    if (!canAccessFailManagement(roles)) {
      return { error: "Bu sayfaya erişim yetkiniz yok." };
    }

    const userId = session.user.id;

    await ensureFailHoldDepot();
    await ensureSupplierPendingDepot();
    const cycle = await ensureOpenFailCycle();

    const customerWhere = customerPortfolioWhere(userId, roles);
    const customers = await prisma.customer.findMany({
      where: customerWhere,
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    const intakes = await prisma.failIntake.findMany({
      where: { customer: customerWhere },
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

    const intakeItems: FailIntakeListItem[] = intakes.map((row) => {
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

    const byCustomer = new Map<
      string,
      { customerId: string; customerName: string; intakes: FailIntakeListItem[] }
    >();
    for (const item of intakeItems) {
      const existing = byCustomer.get(item.customerId);
      if (existing) existing.intakes.push(item);
      else {
        byCustomer.set(item.customerId, {
          customerId: item.customerId,
          customerName: item.customerName,
          intakes: [item],
        });
      }
    }

    const customerSummaryMap = new Map<string, FailCustomerSummary>();
    for (const item of intakeItems) {
      const prev = customerSummaryMap.get(item.customerId);
      if (prev) {
        prev.totalFailCount += item.failCount;
        prev.totalCredit += item.creditQuantity;
        prev.intakeCount += 1;
      } else {
        customerSummaryMap.set(item.customerId, {
          customerId: item.customerId,
          customerName: item.customerName,
          totalFailCount: item.failCount,
          totalCredit: item.creditQuantity,
          intakeCount: 1,
        });
      }
    }

    const failHold = await ensureFailHoldDepot();
    const holdItems = await prisma.stockItem.findMany({
      where: {
        locationId: failHold.id,
        isAvailable: true,
        failGivenItems: {
          some: {
            disposition: "FAIL_HOLD",
            intake: { cycleId: cycle.id },
          },
        },
      },
      include: {
        product: {
          select: { id: true, referenceCode: true, name: true, brand: true },
        },
      },
    });

    const aggMap = new Map<string, FailAggLine>();
    for (const item of holdItems) {
      const prev = aggMap.get(item.productId);
      if (prev) prev.quantity += 1;
      else {
        aggMap.set(item.productId, {
          productId: item.productId,
          referenceCode: item.product.referenceCode,
          productName: item.product.name,
          brand: item.product.brand,
          quantity: 1,
        });
      }
    }

    const supplierPending = await ensureSupplierPendingDepot();
    const pendingItems = await prisma.stockItem.findMany({
      where: { locationId: supplierPending.id, isAvailable: true },
      include: {
        product: {
          select: { id: true, referenceCode: true, name: true, brand: true },
        },
      },
    });
    const pendingMap = new Map<string, FailPendingLine>();
    for (const item of pendingItems) {
      const prev = pendingMap.get(item.productId);
      if (prev) prev.quantity += 1;
      else {
        pendingMap.set(item.productId, {
          productId: item.productId,
          referenceCode: item.product.referenceCode,
          productName: item.product.name,
          brand: item.product.brand,
          quantity: 1,
        });
      }
    }

    const sentAgg = await prisma.failShipmentLine.aggregate({
      _sum: { quantity: true },
    });
    const receivedAgg = await prisma.failSupplierReceiptLine.aggregate({
      _sum: { quantity: true },
    });

    const latestShipment = await prisma.failShipment.findFirst({
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    return {
      data: {
        canMutate: canMutateData(roles),
        customers,
        customerSummary: Array.from(customerSummaryMap.values()).sort((a, b) =>
          a.customerName.localeCompare(b.customerName, "tr"),
        ),
        supplierSummary: {
          sentTotal: sentAgg._sum.quantity ?? 0,
          pendingTotal: pendingItems.length,
          receivedTotal: receivedAgg._sum.quantity ?? 0,
        },
        intakesByCustomer: Array.from(byCustomer.values()).sort((a, b) =>
          a.customerName.localeCompare(b.customerName, "tr"),
        ),
        aggregation: Array.from(aggMap.values()).sort((a, b) =>
          a.referenceCode.localeCompare(b.referenceCode),
        ),
        pending: Array.from(pendingMap.values()).sort((a, b) =>
          a.referenceCode.localeCompare(b.referenceCode),
        ),
        openCycleId: cycle.id,
        latestShipmentId: latestShipment?.id ?? null,
      },
    };
  } catch (error) {
    console.error("[loadFailPageData]", error);
    const detail =
      error instanceof Error ? error.message : "Bilinmeyen hata";
    return {
      error: `Fail sayfası verileri yüklenemedi. (${detail})`,
    };
  }
}
