"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { hasRole } from "@/lib/roles";

export type StockExportRow = {
  ilgiliEleman: string;
  depoIsmi: string;
  referansNo: string;
  urunAdi: string;
  barkod: string;
  adet: number;
};

/**
 * Merkez + konsinye depolardaki müsait stokları (adet > 0)
 * ürün × depo bazında düz liste olarak döner.
 */
export async function getAllStocksForExportAction(): Promise<{
  error?: string;
  data?: StockExportRow[];
}> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { error: "Oturum bulunamadı." };
    }
    if (!hasRole(session.user.roles, "ADMIN")) {
      return { error: "Bu işlem için ADMIN yetkisi gerekli." };
    }

    const groups = await prisma.stockItem.groupBy({
      by: ["productId", "locationId"],
      where: { isAvailable: true },
      _count: { _all: true },
    });

    const positive = groups.filter((g) => g._count._all > 0);
    if (positive.length === 0) {
      return { data: [] };
    }

    const productIds = [...new Set(positive.map((g) => g.productId))];
    const locationIds = [...new Set(positive.map((g) => g.locationId))];

    const [products, locations] = await Promise.all([
      prisma.product.findMany({
        where: { id: { in: productIds } },
        select: {
          id: true,
          referenceCode: true,
          name: true,
          barcode: true,
        },
      }),
      prisma.location.findMany({
        where: { id: { in: locationIds } },
        select: {
          id: true,
          name: true,
          type: true,
          customer: {
            select: {
              assignedUser: {
                select: { fullName: true },
              },
            },
          },
        },
      }),
    ]);

    const productMap = new Map(products.map((p) => [p.id, p]));
    const locationMap = new Map(locations.map((l) => [l.id, l]));

    const rows: StockExportRow[] = positive
      .map((g) => {
        const product = productMap.get(g.productId);
        const location = locationMap.get(g.locationId);
        if (!product || !location) return null;

        const assignedName =
          location.type === "CLINIC_DEPOT"
            ? location.customer?.assignedUser?.fullName?.trim()
            : null;

        return {
          ilgiliEleman: assignedName || "Merkez (Atanmamış)",
          depoIsmi: location.name,
          referansNo: product.referenceCode,
          urunAdi: product.name,
          barkod: product.barcode?.trim() || "",
          adet: g._count._all,
        } satisfies StockExportRow;
      })
      .filter((r): r is StockExportRow => r != null)
      .sort((a, b) => {
        const byDepot = a.depoIsmi.localeCompare(b.depoIsmi, "tr");
        if (byDepot !== 0) return byDepot;
        return a.referansNo.localeCompare(b.referansNo, "tr");
      });

    return { data: rows };
  } catch (error) {
    console.error("[getAllStocksForExportAction]", error);
    return { error: "Stok raporu hazırlanırken bir hata oluştu." };
  }
}
