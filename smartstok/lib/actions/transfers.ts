"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ensureMainDepot } from "@/lib/inventory";
import { assertCanMutate, canSeeAllCustomers, mutationDeniedMessage } from "@/lib/roles";
import { locationPortfolioWhere } from "@/lib/portfolio";
import type { UserRole } from "@/types/next-auth";
import {
  groupTransferLogs,
  type GroupedTransferLog,
  type TransferLogFlat,
} from "@/lib/transfer-grouping";

export type TransferActionResult = {
  error?: string;
  success?: boolean;
  transferredCount?: number;
};

export type TransferLocationOption = {
  id: string;
  name: string;
  type: "MAIN_DEPOT" | "CLINIC_DEPOT";
  label: string;
};

export type TransferPageData = {
  locations: TransferLocationOption[];
  fieldUsers: Array<{
    id: string;
    fullName: string;
    roles: string[];
    email: string;
  }>;
  recentTransfers: GroupedTransferLog[];
};

const transferSchema = z.object({
  fromLocationId: z.string().min(1, "Kaynak depo seçilmeli."),
  toLocationId: z.string().min(1, "Hedef depo seçilmeli."),
  requestedById: z.string().min(1, "Talep eden saha elemanı seçilmeli."),
  productId: z.string().min(1, "Ürün seçilmeli."),
  lotSelections: z
    .array(
      z.object({
        lotNumber: z.string().min(1),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1, "En az bir lot seçilmeli."),
});

function locationLabel(loc: {
  name: string;
  type: string;
  customer?: { name: string } | null;
}) {
  if (loc.type === "MAIN_DEPOT") return loc.name;
  const clinic = loc.customer?.name;
  return clinic ? `${clinic} · ${loc.name}` : loc.name;
}

export async function executeConsignmentTransferAction(
  input: z.infer<typeof transferSchema>,
): Promise<TransferActionResult> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { error: "Oturum bulunamadı." };
    }
    assertCanMutate(session.user.roles);

    const parsed = transferSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Geçersiz transfer." };
    }

    if (parsed.data.fromLocationId === parsed.data.toLocationId) {
      return { error: "Kaynak ve hedef depo aynı olamaz." };
    }

    const [fromLocation, toLocation] = await Promise.all([
      prisma.location.findUnique({ where: { id: parsed.data.fromLocationId } }),
      prisma.location.findUnique({ where: { id: parsed.data.toLocationId } }),
    ]);

    if (!fromLocation) {
      return { error: "Kaynak depo bulunamadı." };
    }
    if (!toLocation) {
      return { error: "Hedef depo bulunamadı." };
    }

    const requester = await prisma.user.findFirst({
      where: {
        id: parsed.data.requestedById,
        isActive: true,
        roles: { hasSome: ["SAHA", "ADMIN", "DEPO"] },
      },
    });

    if (!requester) {
      return { error: "Talep eden kullanıcı bulunamadı." };
    }

    const totalRequested = parsed.data.lotSelections.reduce(
      (sum, lot) => sum + lot.quantity,
      0,
    );

    const transferred = await prisma.$transaction(async (tx) => {
      const selectedItemIds: string[] = [];

      for (const selection of parsed.data.lotSelections) {
        const available = await tx.stockItem.findMany({
          where: {
            productId: parsed.data.productId,
            locationId: fromLocation.id,
            lotNumber: selection.lotNumber,
            isAvailable: true,
          },
          take: selection.quantity,
          orderBy: { createdAt: "asc" },
          select: { id: true },
        });

        if (available.length < selection.quantity) {
          throw new Error(
            `Lot ${selection.lotNumber}: istenen ${selection.quantity}, müsait ${available.length}.`,
          );
        }

        selectedItemIds.push(...available.map((item) => item.id));
      }

      if (selectedItemIds.length !== totalRequested) {
        throw new Error("Seçilen stok adedi tutarsız.");
      }

      await tx.stockItem.updateMany({
        where: { id: { in: selectedItemIds } },
        data: { locationId: toLocation.id },
      });

      await tx.transferLog.createMany({
        data: selectedItemIds.map((stockItemId) => ({
          fromLocationId: fromLocation.id,
          toLocationId: toLocation.id,
          stockItemId,
          executedById: session.user.id,
          requestedById: requester.id,
        })),
      });

      return selectedItemIds.length;
    });

    revalidatePath("/dashboard/transfers");
    revalidatePath("/dashboard/customers");
    revalidatePath("/dashboard/depots");
    revalidatePath(`/dashboard/depots/${fromLocation.id}`);
    revalidatePath(`/dashboard/depots/${toLocation.id}`);

    return { success: true, transferredCount: transferred };
  } catch (error) {
    console.error(error);
    return {
      error:
        error instanceof Error
          ? error.message
          : "Transfer sırasında bir hata oluştu.",
    };
  }
}

async function fetchTransferLogs(where: {
  OR?: Array<{ fromLocationId?: string; toLocationId?: string }>;
}) {
  return prisma.transferLog.findMany({
    where,
    take: 400,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      fromLocationId: true,
      toLocationId: true,
      executedById: true,
      requestedById: true,
      stockItem: {
        select: {
          lotNumber: true,
          product: {
            select: { id: true, referenceCode: true, name: true },
          },
        },
      },
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
      executedBy: { select: { fullName: true } },
      requestedBy: { select: { fullName: true } },
    },
  });
}

function mapLogsToFlat(
  logs: Awaited<ReturnType<typeof fetchTransferLogs>>,
): TransferLogFlat[] {
  return logs.map((log) => ({
    id: log.id,
    createdAt: log.createdAt.toISOString(),
    fromLocationId: log.fromLocationId,
    toLocationId: log.toLocationId,
    fromName: locationLabel(log.fromLocation),
    toName: locationLabel(log.toLocation),
    lotNumber: log.stockItem.lotNumber,
    productId: log.stockItem.product.id,
    referenceCode: log.stockItem.product.referenceCode,
    productName: log.stockItem.product.name,
    requestedByName: log.requestedBy?.fullName ?? null,
    executedByName: log.executedBy.fullName,
    executedById: log.executedById,
    requestedById: log.requestedById,
  }));
}

export async function getTransferPageDataAction(): Promise<TransferPageData> {
  await ensureMainDepot();

  const session = await auth();
  const roles = session?.user?.roles as UserRole[] | undefined;
  const userId = session?.user?.id;
  const locWhere = locationPortfolioWhere(userId, roles);

  const [locations, fieldUsers, recentLogs] = await Promise.all([
    prisma.location.findMany({
      where: locWhere,
      select: {
        id: true,
        name: true,
        type: true,
        customer: { select: { name: true } },
      },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    }),
    prisma.user.findMany({
      where: {
        isActive: true,
        roles: { hasSome: ["SAHA", "ADMIN", "DEPO"] },
      },
      select: {
        id: true,
        fullName: true,
        roles: true,
        email: true,
      },
      orderBy: { fullName: "asc" },
    }),
    fetchTransferLogs({}),
  ]);

  const allowedLocationIds = new Set(locations.map((l) => l.id));
  const scopedLogs = canSeeAllCustomers(roles)
    ? recentLogs
    : recentLogs.filter(
        (log) =>
          allowedLocationIds.has(log.fromLocationId) ||
          allowedLocationIds.has(log.toLocationId),
      );

  return {
    locations: locations.map((loc) => ({
      id: loc.id,
      name: loc.name,
      type: loc.type as "MAIN_DEPOT" | "CLINIC_DEPOT",
      label: locationLabel(loc),
    })),
    fieldUsers,
    recentTransfers: groupTransferLogs(mapLogsToFlat(scopedLogs)).slice(0, 50),
  };
}

export type DepotMovementRow = GroupedTransferLog & {
  direction: "IN" | "OUT";
};

export async function getDepotMovementsAction(
  locationId: string,
): Promise<DepotMovementRow[]> {
  const logs = await fetchTransferLogs({
    OR: [{ fromLocationId: locationId }, { toLocationId: locationId }],
  });

  return groupTransferLogs(mapLogsToFlat(logs))
    .map((row) => ({
      ...row,
      direction: (row.toLocationId === locationId ? "IN" : "OUT") as
        | "IN"
        | "OUT",
    }))
    .slice(0, 80);
}
