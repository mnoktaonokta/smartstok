"use server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ensureMainDepot } from "@/lib/inventory";
import { formatProductSize } from "@/lib/inventory";
import { locationPortfolioWhere } from "@/lib/portfolio";
import { canSeeAllCustomers } from "@/lib/roles";
import type { UserRole } from "@/types/next-auth";

export type DepotSummary = {
  id: string;
  name: string;
  type: "MAIN_DEPOT" | "CLINIC_DEPOT";
  customerName: string | null;
  totalItems: number;
  productCount: number;
};

export type DepotInventoryRow = {
  key: string;
  productId: string;
  productName: string;
  referenceCode: string;
  brand: string;
  lotNumber: string;
  quantity: number;
  label: string;
};

export async function listDepotsAction(): Promise<DepotSummary[]> {
  await ensureMainDepot();

  const session = await auth();
  const where = locationPortfolioWhere(
    session?.user?.id,
    session?.user?.roles as UserRole[] | undefined,
  );

  const locations = await prisma.location.findMany({
    where,
    include: {
      customer: { select: { name: true } },
      stockItems: {
        where: { isAvailable: true },
        select: { productId: true },
      },
    },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });

  return locations.map((loc) => {
    const productIds = new Set(loc.stockItems.map((s) => s.productId));
    return {
      id: loc.id,
      name: loc.name,
      type: loc.type as "MAIN_DEPOT" | "CLINIC_DEPOT",
      customerName: loc.customer?.name ?? null,
      totalItems: loc.stockItems.length,
      productCount: productIds.size,
    };
  });
}

export async function getDepotInventoryAction(
  locationId: string,
): Promise<{
  location: {
    id: string;
    name: string;
    type: "MAIN_DEPOT" | "CLINIC_DEPOT";
    customerId: string | null;
    customerName: string | null;
  } | null;
  rows: DepotInventoryRow[];
}> {
  const location = await prisma.location.findUnique({
    where: { id: locationId },
    include: { customer: { select: { id: true, name: true } } },
  });

  if (
    location &&
    location.type !== "MAIN_DEPOT" &&
    location.type !== "CLINIC_DEPOT"
  ) {
    return { location: null, rows: [] };
  }

  if (!location) {
    return { location: null, rows: [] };
  }

  const session = await auth();
  const roles = session?.user?.roles as UserRole[] | undefined;
  if (
    location.type === "CLINIC_DEPOT" &&
    !canSeeAllCustomers(roles)
  ) {
    const customer = await prisma.customer.findFirst({
      where: {
        id: location.customerId ?? "__none__",
        assignedUserId: session?.user?.id ?? "__none__",
      },
      select: { id: true },
    });
    if (!customer) {
      return { location: null, rows: [] };
    }
  }

  const items = await prisma.stockItem.findMany({
    where: {
      locationId,
      isAvailable: true,
    },
    include: {
      product: true,
    },
  });

  const grouped = new Map<
    string,
    {
      productId: string;
      productName: string;
      referenceCode: string;
      brand: string;
      diameter: number | null;
      length: number | null;
      lotNumber: string;
      quantity: number;
    }
  >();

  for (const item of items) {
    const key = `${item.productId}::${item.lotNumber}`;
    const current = grouped.get(key);
    if (current) {
      current.quantity += 1;
    } else {
      grouped.set(key, {
        productId: item.productId,
        productName: item.product.name,
        referenceCode: item.product.referenceCode,
        brand: item.product.brand,
        diameter: item.product.diameter,
        length: item.product.length,
        lotNumber: item.lotNumber,
        quantity: 1,
      });
    }
  }

  const rows: DepotInventoryRow[] = Array.from(grouped.entries())
    .map(([key, g]) => {
      const size = formatProductSize(g.diameter, g.length);
      const sizePart = size ? ` (${size})` : "";
      return {
        key,
        productId: g.productId,
        productName: g.productName,
        referenceCode: g.referenceCode,
        brand: g.brand,
        lotNumber: g.lotNumber,
        quantity: g.quantity,
        label: `${g.productName}${sizePart} - Lot ${g.lotNumber} - ${g.quantity} Adet`,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, "tr"));

  return {
    location: {
      id: location.id,
      name: location.name,
      type: location.type as "MAIN_DEPOT" | "CLINIC_DEPOT",
      customerId: location.customerId ?? location.customer?.id ?? null,
      customerName: location.customer?.name ?? null,
    },
    rows,
  };
}
