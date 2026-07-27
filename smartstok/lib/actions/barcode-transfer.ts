"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { assertCanMutate, mutationDeniedMessage } from "@/lib/roles";

export type BarcodeScanLot = {
  lotNumber: string;
  available: number;
};

export type BarcodeScanResult =
  | {
      ok: true;
      productId: string;
      barcode: string;
      referenceCode: string;
      productName: string;
      brand: string;
      lots: BarcodeScanLot[];
      /** Tek lot varsa otomatik seçilebilir */
      autoLotNumber: string | null;
    }
  | {
      ok: false;
      error: string;
    };

export async function scanBarcodeAtLocationAction(
  barcode: string,
  fromLocationId: string,
): Promise<BarcodeScanResult> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { ok: false, error: "Oturum bulunamadı." };
    }

    const cleaned = barcode.trim();
    if (!cleaned) {
      return { ok: false, error: "Barkod boş olamaz." };
    }

    if (!fromLocationId) {
      return { ok: false, error: "Kaynak depo seçilmeli." };
    }

    const product = await prisma.product.findFirst({
      where: { barcode: cleaned },
    });

    if (!product) {
      return {
        ok: false,
        error: "HATA: Bu barkod sistemde tanımlı değil!",
      };
    }

    const stockItems = await prisma.stockItem.findMany({
      where: {
        productId: product.id,
        locationId: fromLocationId,
        isAvailable: true,
      },
      select: { lotNumber: true },
    });

    if (stockItems.length === 0) {
      return {
        ok: false,
        error: "HATA: Bu barkod müşterinin deposunda bulunamadı!",
      };
    }

    const lotMap = new Map<string, number>();
    for (const item of stockItems) {
      lotMap.set(item.lotNumber, (lotMap.get(item.lotNumber) ?? 0) + 1);
    }

    const lots = Array.from(lotMap.entries())
      .map(([lotNumber, available]) => ({ lotNumber, available }))
      .sort((a, b) => a.lotNumber.localeCompare(b.lotNumber));

    return {
      ok: true,
      productId: product.id,
      barcode: product.barcode ?? cleaned,
      referenceCode: product.referenceCode,
      productName: product.name,
      brand: product.brand,
      lots,
      autoLotNumber: lots.length === 1 ? lots[0].lotNumber : null,
    };
  } catch (error) {
    console.error(error);
    return { ok: false, error: "Barkod sorgusu sırasında bir hata oluştu." };
  }
}

const basketTransferSchema = z.object({
  fromLocationId: z.string().min(1),
  toLocationId: z.string().min(1),
  requestedById: z.string().min(1),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        lotNumber: z.string().min(1),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1, "Sepet boş."),
});

export async function executeBasketTransferAction(
  input: z.infer<typeof basketTransferSchema>,
): Promise<{ error?: string; success?: boolean; transferredCount?: number }> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { error: "Oturum bulunamadı." };
    }
    assertCanMutate(session.user.roles);

    const parsed = basketTransferSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Geçersiz sepet." };
    }

    if (parsed.data.fromLocationId === parsed.data.toLocationId) {
      return { error: "Kaynak ve hedef depo aynı olamaz." };
    }

    const [fromLocation, toLocation, requester] = await Promise.all([
      prisma.location.findUnique({ where: { id: parsed.data.fromLocationId } }),
      prisma.location.findUnique({ where: { id: parsed.data.toLocationId } }),
      prisma.user.findFirst({
        where: {
          id: parsed.data.requestedById,
          isActive: true,
        },
      }),
    ]);

    if (!fromLocation || !toLocation) {
      return { error: "Depo bulunamadı." };
    }
    if (!requester) {
      return { error: "Talep eden kullanıcı bulunamadı." };
    }

    const transferred = await prisma.$transaction(async (tx) => {
      const selectedItemIds: string[] = [];

      for (const line of parsed.data.items) {
        const available = await tx.stockItem.findMany({
          where: {
            productId: line.productId,
            locationId: fromLocation.id,
            lotNumber: line.lotNumber,
            isAvailable: true,
          },
          take: line.quantity,
          orderBy: { createdAt: "asc" },
          select: { id: true },
        });

        if (available.length < line.quantity) {
          throw new Error(
            `Yetersiz stok: ürün lot ${line.lotNumber} (istenilen ${line.quantity}, müsait ${available.length}).`,
          );
        }

        selectedItemIds.push(...available.map((i) => i.id));
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
          : "Sepet transferi sırasında bir hata oluştu.",
    };
  }
}
