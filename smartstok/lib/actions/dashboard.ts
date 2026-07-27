"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { customerPortfolioWhere } from "@/lib/portfolio";
import { isPortfolioScopedSales } from "@/lib/roles";
import type { UserRole } from "@/types/next-auth";

export type DashboardStats = {
  consignmentStockValue: number;
  pendingUtsCount: number;
  receivablesTotal: number;
  monthInvoiceVolume: number;
};

export type SalesTrendPoint = {
  date: string;
  label: string;
  total: number;
};

export type TopClinicPoint = {
  locationId: string;
  clinicName: string;
  quantity: number;
};

export type DashboardData = {
  stats: DashboardStats;
  salesTrend: SalesTrendPoint[];
  topClinics: TopClinicPoint[];
  criticalStocks: CriticalStockAlarmItem[];
};

export type CriticalStockAlarmItem = {
  productId: string;
  name: string;
  currentStock: number;
  minStockLevel: number;
};

/**
 * Kritik stok alarmı: merkez depo müsait stok <= minStockLevel ve alarm açık.
 */
export async function getCriticalStocks(): Promise<CriticalStockAlarmItem[]> {
  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      minStockLevel: { gt: 0 },
    },
    select: {
      id: true,
      name: true,
      minStockLevel: true,
      _count: {
        select: {
          stockItems: {
            where: {
              isAvailable: true,
              location: { type: "MAIN_DEPOT" },
            },
          },
        },
      },
    },
  });

  return products
    .map((p) => ({
      productId: p.id,
      name: p.name,
      currentStock: p._count.stockItems,
      minStockLevel: p.minStockLevel,
    }))
    .filter((p) => p.currentStock <= p.minStockLevel)
    .sort((a, b) => a.currentStock - b.currentStock);
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function formatDayKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDayLabel(d: Date) {
  return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
}

/**
 * Yönetici özet ekranı için istatistik ve grafik verileri.
 */
export async function getDashboardDataAction(): Promise<DashboardData> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const trendStart = startOfDay(addDays(now, -6));

  const [
    consignmentItems,
    pendingUtsCount,
    invoiceItemsAll,
    monthInvoiceItems,
    recentInvoiceItems,
    clinicGroups,
    criticalStocks,
  ] = await Promise.all([
    // Konsinye stok değeri (müsait + klinik depo) — satış değeri
    prisma.stockItem.findMany({
      where: {
        isAvailable: true,
        location: { type: "CLINIC_DEPOT" },
      },
      select: {
        product: { select: { salePrice: true } },
      },
    }),

    // Faturalanmış, ÜTS bekleyen
    prisma.stockItem.count({
      where: {
        isAvailable: false,
        utsStatus: "PENDING",
      },
    }),

    // Cari alacak tahmini: tüm fatura satırları net tutarı
    // (ödeme kaydı yok; faturalanan net = alacak proxy)
    prisma.invoiceItem.findMany({
      select: { salePrice: true, discount: true },
    }),

    // Bu ay fatura hacmi
    prisma.invoiceItem.findMany({
      where: {
        invoice: { createdAt: { gte: monthStart } },
      },
      select: { salePrice: true, discount: true },
    }),

    // Son 7 gün satış trendi
    prisma.invoiceItem.findMany({
      where: {
        invoice: { createdAt: { gte: trendStart } },
      },
      select: {
        salePrice: true,
        discount: true,
        invoice: { select: { createdAt: true } },
      },
    }),

    // Klinik bazlı konsinye adet
    prisma.stockItem.groupBy({
      by: ["locationId"],
      where: {
        isAvailable: true,
        location: { type: "CLINIC_DEPOT" },
      },
      _count: { _all: true },
      orderBy: { _count: { locationId: "desc" } },
      take: 5,
    }),

    getCriticalStocks(),
  ]);

  const consignmentStockValue = consignmentItems.reduce(
    (sum, item) => sum + Number(item.product.salePrice),
    0,
  );

  const receivablesTotal = invoiceItemsAll.reduce(
    (sum, item) => sum + Number(item.salePrice) - Number(item.discount),
    0,
  );

  const monthInvoiceVolume = monthInvoiceItems.reduce(
    (sum, item) => sum + Number(item.salePrice) - Number(item.discount),
    0,
  );

  // 7 günlük trend (eksik günler 0)
  const byDay = new Map<string, number>();
  for (let i = 0; i < 7; i++) {
    const d = addDays(trendStart, i);
    byDay.set(formatDayKey(d), 0);
  }
  for (const item of recentInvoiceItems) {
    const key = formatDayKey(new Date(item.invoice.createdAt));
    if (!byDay.has(key)) continue;
    const net = Number(item.salePrice) - Number(item.discount);
    byDay.set(key, (byDay.get(key) ?? 0) + net);
  }

  const salesTrend: SalesTrendPoint[] = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(trendStart, i);
    const key = formatDayKey(d);
    salesTrend.push({
      date: key,
      label: formatDayLabel(d),
      total: Math.round((byDay.get(key) ?? 0) * 100) / 100,
    });
  }

  const locationIds = clinicGroups.map((g) => g.locationId);
  const locations =
    locationIds.length > 0
      ? await prisma.location.findMany({
          where: { id: { in: locationIds } },
          select: {
            id: true,
            name: true,
            customer: { select: { name: true } },
          },
        })
      : [];

  const locMap = new Map(locations.map((l) => [l.id, l]));

  const topClinics: TopClinicPoint[] = clinicGroups.map((g) => {
    const loc = locMap.get(g.locationId);
    const clinicName =
      loc?.customer?.name?.trim() ||
      loc?.name?.replace(/\s*Konsinye Deposu\s*$/i, "").trim() ||
      "Klinik";
    return {
      locationId: g.locationId,
      clinicName,
      quantity: g._count._all,
    };
  });

  return {
    stats: {
      consignmentStockValue:
        Math.round(consignmentStockValue * 100) / 100,
      pendingUtsCount,
      receivablesTotal: Math.round(receivablesTotal * 100) / 100,
      monthInvoiceVolume: Math.round(monthInvoiceVolume * 100) / 100,
    },
    salesTrend,
    topClinics,
    criticalStocks,
  };
}

export type WarehouseDashboardData = {
  criticalStocks: CriticalStockAlarmItem[];
  todayOutboundQty: number;
  activeProductCount: number;
};

/** Depo özeti — finansal veri yok */
export async function getWarehouseDashboardDataAction(): Promise<WarehouseDashboardData> {
  const dayStart = startOfDay(new Date());

  const [todayOutboundQty, activeProductCount, criticalStocks] =
    await Promise.all([
      prisma.transferLog.count({
        where: { createdAt: { gte: dayStart } },
      }),
      prisma.product.count({ where: { isActive: true } }),
      getCriticalStocks(),
    ]);

  return {
    criticalStocks,
    todayOutboundQty,
    activeProductCount,
  };
}

export type SalesRecentTransfer = {
  key: string;
  createdAt: string;
  clinicName: string;
  quantity: number;
  referenceCode: string;
  productName: string;
};

export type SalesAgendaTask = {
  id: string;
  title: string;
  dueDate: string;
  customerId: string;
  customerName: string;
};

export type SalesDashboardData = {
  consignmentQty: number;
  consignmentSaleValue: number;
  activeCustomerCount: number;
  recentTransfers: SalesRecentTransfer[];
  pendingTasks: SalesAgendaTask[];
};

/** Saha satış özeti */
export async function getSalesDashboardDataAction(): Promise<SalesDashboardData> {
  const session = await auth();
  const userId = session?.user?.id;
  const roles = session?.user?.roles as UserRole[] | undefined;
  const customerWhere = customerPortfolioWhere(userId, roles);
  const scoped = isPortfolioScopedSales(roles);

  const clinicStockWhere = scoped
    ? {
        isAvailable: true as const,
        location: {
          type: "CLINIC_DEPOT" as const,
          customer: { assignedUserId: userId },
        },
      }
    : {
        isAvailable: true as const,
        location: { type: "CLINIC_DEPOT" as const },
      };

  const [consignmentItems, activeCustomerCount, recentLogs, pendingTaskRows] =
    await Promise.all([
      prisma.stockItem.findMany({
        where: clinicStockWhere,
        select: {
          product: { select: { salePrice: true } },
        },
      }),
      prisma.customer.count({ where: customerWhere }),
      prisma.transferLog.findMany({
        where: scoped
          ? {
              OR: [
                { toLocation: { customer: { assignedUserId: userId } } },
                { fromLocation: { customer: { assignedUserId: userId } } },
              ],
            }
          : undefined,
        orderBy: { createdAt: "desc" },
        take: 80,
        select: {
          id: true,
          createdAt: true,
          fromLocationId: true,
          toLocationId: true,
          fromLocation: {
            select: {
              name: true,
              type: true,
              customer: { select: { name: true } },
            },
          },
          toLocation: {
            select: {
              name: true,
              type: true,
              customer: { select: { name: true } },
            },
          },
          stockItem: {
            select: {
              lotNumber: true,
              product: {
                select: { id: true, referenceCode: true, name: true },
              },
            },
          },
          executedBy: { select: { fullName: true } },
          requestedBy: { select: { fullName: true } },
        },
      }),
      userId
        ? prisma.task.findMany({
            where: {
              userId,
              isCompleted: false,
              ...(scoped
                ? { customer: { assignedUserId: userId } }
                : {}),
            },
            orderBy: { dueDate: "asc" },
            select: {
              id: true,
              title: true,
              dueDate: true,
              customer: { select: { id: true, name: true } },
            },
          })
        : Promise.resolve([]),
    ]);

  const consignmentQty = consignmentItems.length;
  const consignmentSaleValue = consignmentItems.reduce(
    (sum, item) => sum + Number(item.product.salePrice),
    0,
  );

  type Acc = {
    key: string;
    createdAt: string;
    clinicName: string;
    quantity: number;
    referenceCode: string;
    productName: string;
  };
  const grouped = new Map<string, Acc>();

  for (const log of recentLogs) {
    const clinicLoc =
      log.toLocation.type === "CLINIC_DEPOT"
        ? log.toLocation
        : log.fromLocation.type === "CLINIC_DEPOT"
          ? log.fromLocation
          : log.toLocation;
    const clinicName =
      clinicLoc.customer?.name?.trim() ||
      clinicLoc.name.replace(/\s*Konsinye Deposu\s*$/i, "").trim() ||
      clinicLoc.name;

    const secondKey = log.createdAt.toISOString().slice(0, 19);
    const key = [
      secondKey,
      log.fromLocationId,
      log.toLocationId,
      log.stockItem.product.id,
      log.stockItem.lotNumber,
    ].join("|");

    const existing = grouped.get(key);
    if (existing) {
      existing.quantity += 1;
    } else {
      grouped.set(key, {
        key,
        createdAt: log.createdAt.toISOString(),
        clinicName,
        quantity: 1,
        referenceCode: log.stockItem.product.referenceCode,
        productName: log.stockItem.product.name,
      });
    }
  }

  const recentTransfers = [...grouped.values()]
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .slice(0, 5);

  const pendingTasks: SalesAgendaTask[] = pendingTaskRows.map((t) => ({
    id: t.id,
    title: t.title,
    dueDate: t.dueDate.toISOString(),
    customerId: t.customer.id,
    customerName: t.customer.name,
  }));

  return {
    consignmentQty,
    consignmentSaleValue: Math.round(consignmentSaleValue * 100) / 100,
    activeCustomerCount,
    recentTransfers,
    pendingTasks,
  };
}
