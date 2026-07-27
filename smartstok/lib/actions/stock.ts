"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ensureMainDepot } from "@/lib/inventory";
import { assertCanMutate, mutationDeniedMessage } from "@/lib/roles";
import type { ActionResult } from "@/lib/actions/customers";

const stockEntrySchema = z.object({
  productId: z.string().min(1, "Ürün seçilmeli."),
  lotNumber: z.string().trim().min(1, "Lot numarası gerekli."),
  quantity: z.coerce
    .number()
    .int("Adet tam sayı olmalı.")
    .positive("Adet en az 1 olmalı.")
    .max(5000, "Tek seferde en fazla 5000 adet girilebilir."),
});

export async function createStockEntryAction(
  input: z.infer<typeof stockEntrySchema>,
): Promise<ActionResult<{ createdCount: number }>> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { error: "Oturum bulunamadı." };
    }
    assertCanMutate(session.user.roles);

    const parsed = stockEntrySchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Geçersiz form." };
    }

    const product = await prisma.product.findUnique({
      where: { id: parsed.data.productId },
    });

    if (!product) {
      return { error: "Ürün bulunamadı." };
    }

    const mainDepot = await ensureMainDepot();
    const lotNumber = parsed.data.lotNumber.trim().toUpperCase();
    const quantity = parsed.data.quantity;

    await prisma.stockItem.createMany({
      data: Array.from({ length: quantity }, () => ({
        productId: product.id,
        lotNumber,
        locationId: mainDepot.id,
        isAvailable: true,
      })),
    });

    revalidatePath("/dashboard/stock-entry");
    revalidatePath("/dashboard/depots");
    revalidatePath("/dashboard/products");
    revalidatePath("/dashboard/transfers");

    return { success: true, data: { createdCount: quantity } };
  } catch (error) {
    const denied = mutationDeniedMessage(error);
    if (denied) return { error: denied };
    console.error(error);
    return { error: "Stok girişi sırasında bir hata oluştu." };
  }
}
