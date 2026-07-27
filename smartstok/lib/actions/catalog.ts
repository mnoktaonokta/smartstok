"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@/app/generated/prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  ensureMainDepot,
  formatProductLabel,
  formatProductSize,
} from "@/lib/inventory";
import {
  assertCanMutate,
  canSeePurchasePrice,
  canSeeSalePrice,
  mutationDeniedMessage,
} from "@/lib/roles";
import type { ActionResult } from "@/lib/actions/customers";

export type ProductListItem = {
  id: string;
  referenceCode: string;
  brand: string;
  category: string;
  name: string;
  diameter: number | null;
  length: number | null;
  barcode: string | null;
  salePrice: string;
  purchasePrice: string | null;
  stockCount: number;
  minStockLevel: number;
  isActive: boolean;
};

function revalidateProductPaths() {
  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard/stock-entry");
  revalidatePath("/dashboard/depots");
  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard");
}

export async function listProductsAction(filters?: {
  category?: string;
  brand?: string;
  /** true = yalnızca aktif; false = yalnızca pasif; undefined = hepsi */
  isActive?: boolean;
}): Promise<ProductListItem[]> {
  const session = await auth();
  const seeSale = canSeeSalePrice(session?.user?.roles);
  const seePurchase = canSeePurchasePrice(session?.user?.roles);

  const where: Prisma.ProductWhereInput = {};

  if (filters?.category) {
    where.category = filters.category;
  }

  if (filters?.brand?.trim()) {
    where.brand = { equals: filters.brand.trim(), mode: "insensitive" };
  }

  if (typeof filters?.isActive === "boolean") {
    where.isActive = filters.isActive;
  }

  const products = await prisma.product.findMany({
    where,
    include: {
      _count: { select: { stockItems: { where: { isAvailable: true } } } },
    },
    orderBy: [{ isActive: "desc" }, { brand: "asc" }, { referenceCode: "asc" }],
  });

  return products.map((p) => ({
    id: p.id,
    referenceCode: p.referenceCode,
    brand: p.brand,
    category: p.category,
    name: p.name,
    diameter: p.diameter,
    length: p.length,
    barcode: p.barcode,
    salePrice: seeSale ? p.salePrice.toString() : "",
    purchasePrice: seePurchase ? p.purchasePrice.toString() : null,
    stockCount: p._count.stockItems,
    minStockLevel: p.minStockLevel,
    isActive: p.isActive,
  }));
}

export async function getProductBrandsAction(): Promise<string[]> {
  const brands = await prisma.product.findMany({
    select: { brand: true },
    distinct: ["brand"],
    orderBy: { brand: "asc" },
  });

  return brands.map((b) => b.brand);
}

const productFieldsSchema = z.object({
  referenceCode: z.string().trim().min(1, "Referans kodu gerekli."),
  brand: z.string().trim().min(1, "Marka gerekli."),
  category: z.string().trim().min(1, "Kategori gerekli."),
  name: z.string().trim().min(1, "Ürün adı gerekli."),
  diameter: z.coerce.number().positive().optional().nullable(),
  length: z.coerce.number().positive().optional().nullable(),
  barcode: z.string().trim().optional().nullable(),
  purchasePrice: z.coerce.number().nonnegative("Alış fiyatı geçersiz."),
  salePrice: z.coerce.number().nonnegative("Satış fiyatı geçersiz."),
  /** 0 = alarm kapalı */
  minStockLevel: z.coerce.number().int().nonnegative().default(0),
});

const createProductSchema = productFieldsSchema;

const updateProductSchema = productFieldsSchema
  .omit({ purchasePrice: true, salePrice: true })
  .extend({
    id: z.string().min(1),
    purchasePrice: z.coerce.number().nonnegative().optional().nullable(),
    salePrice: z.coerce.number().nonnegative().optional().nullable(),
    /** Merkez depo müsait stok hedef miktarı (isteğe bağlı) */
    quantity: z.coerce.number().int().nonnegative().optional().nullable(),
  });

export async function createProductAction(
  input: z.infer<typeof createProductSchema>,
): Promise<ActionResult<{ productId: string }>> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { error: "Oturum bulunamadı." };
    }
    assertCanMutate(session.user.roles);

    const parsed = createProductSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Geçersiz form." };
    }

    const barcode = parsed.data.barcode?.trim() || null;

    const duplicate = await prisma.product.findFirst({
      where: {
        OR: [
          { referenceCode: parsed.data.referenceCode },
          ...(barcode ? [{ barcode }] : []),
        ],
      },
    });

    if (duplicate) {
      return {
        error:
          duplicate.referenceCode === parsed.data.referenceCode
            ? "Bu referans kodu zaten kayıtlı."
            : "Bu barkod zaten kayıtlı.",
      };
    }

    const product = await prisma.product.create({
      data: {
        referenceCode: parsed.data.referenceCode,
        brand: parsed.data.brand,
        category: parsed.data.category,
        name: parsed.data.name,
        diameter: parsed.data.diameter ?? null,
        length: parsed.data.length ?? null,
        barcode,
        purchasePrice: parsed.data.purchasePrice,
        salePrice: parsed.data.salePrice,
        minStockLevel: parsed.data.minStockLevel,
        isActive: true,
      },
    });

    revalidateProductPaths();

    return { success: true, data: { productId: product.id } };
  } catch (error) {
    const denied = mutationDeniedMessage(error);
    if (denied) return { error: denied };
    console.error(error);
    return { error: "Ürün oluşturulurken bir hata oluştu." };
  }
}

/** Merkez depo müsait stok miktarını hedefe ayarlar */
async function syncMainDepotQuantity(productId: string, qty: number) {
  const mainDepot = await ensureMainDepot();
  const available = await prisma.stockItem.findMany({
    where: {
      productId,
      locationId: mainDepot.id,
      isAvailable: true,
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  const current = available.length;
  const lotNumber = `EDIT-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;

  if (qty > current) {
    await prisma.stockItem.createMany({
      data: Array.from({ length: qty - current }, () => ({
        productId,
        lotNumber,
        locationId: mainDepot.id,
        isAvailable: true,
      })),
    });
  } else if (qty < current) {
    const removeIds = available.slice(qty).map((i) => i.id);
    await prisma.stockItem.updateMany({
      where: { id: { in: removeIds } },
      data: { isAvailable: false, utsStatus: "SUCCESS" },
    });
  }
}

export async function updateProductAction(
  input: z.infer<typeof updateProductSchema>,
): Promise<ActionResult> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { error: "Oturum bulunamadı." };
    }
    assertCanMutate(session.user.roles);

    const parsed = updateProductSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Geçersiz form." };
    }

    const existing = await prisma.product.findUnique({
      where: { id: parsed.data.id },
    });
    if (!existing) {
      return { error: "Ürün bulunamadı." };
    }

    const barcode = parsed.data.barcode?.trim() || null;

    const duplicate = await prisma.product.findFirst({
      where: {
        id: { not: parsed.data.id },
        OR: [
          { referenceCode: parsed.data.referenceCode },
          ...(barcode ? [{ barcode }] : []),
        ],
      },
    });

    if (duplicate) {
      return {
        error:
          duplicate.referenceCode === parsed.data.referenceCode
            ? "Bu referans kodu başka bir üründe kayıtlı."
            : "Bu barkod başka bir üründe kayıtlı.",
      };
    }

    await prisma.product.update({
      where: { id: parsed.data.id },
      data: {
        referenceCode: parsed.data.referenceCode,
        brand: parsed.data.brand,
        category: parsed.data.category,
        name: parsed.data.name,
        diameter: parsed.data.diameter ?? null,
        length: parsed.data.length ?? null,
        barcode,
        minStockLevel: parsed.data.minStockLevel,
        ...(parsed.data.salePrice != null
          ? { salePrice: parsed.data.salePrice }
          : {}),
        ...(parsed.data.purchasePrice != null
          ? { purchasePrice: parsed.data.purchasePrice }
          : {}),
      },
    });

    if (
      parsed.data.quantity != null &&
      Number.isFinite(parsed.data.quantity)
    ) {
      await syncMainDepotQuantity(parsed.data.id, parsed.data.quantity);
    }

    revalidateProductPaths();
    return { success: true };
  } catch (error) {
    const denied = mutationDeniedMessage(error);
    if (denied) return { error: denied };
    console.error("[updateProductAction]", error);
    return { error: "Ürün güncellenirken bir hata oluştu." };
  }
}

export async function toggleProductStatusAction(
  productId: string,
): Promise<ActionResult<{ isActive: boolean }>> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { error: "Oturum bulunamadı." };
    }
    assertCanMutate(session.user.roles);

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, isActive: true },
    });
    if (!product) {
      return { error: "Ürün bulunamadı." };
    }

    const updated = await prisma.product.update({
      where: { id: productId },
      data: { isActive: !product.isActive },
      select: { isActive: true },
    });

    revalidateProductPaths();
    return { success: true, data: { isActive: updated.isActive } };
  } catch (error) {
    const denied = mutationDeniedMessage(error);
    if (denied) return { error: denied };
    console.error("[toggleProductStatusAction]", error);
    return { error: "Ürün durumu güncellenemedi." };
  }
}

export async function deleteProductAction(
  productId: string,
): Promise<ActionResult> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { error: "Oturum bulunamadı." };
    }
    assertCanMutate(session.user.roles);

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    if (!product) {
      return { error: "Ürün bulunamadı." };
    }

    const anyStock = await prisma.stockItem.count({
      where: { productId },
    });

    if (anyStock > 0) {
      return {
        error:
          "Bu ürün işlem gördüğü için silinemez, lütfen pasife almayı tercih edin",
      };
    }

    await prisma.product.delete({ where: { id: productId } });

    revalidateProductPaths();
    return { success: true };
  } catch (error) {
    const denied = mutationDeniedMessage(error);
    if (denied) return { error: denied };
    console.error("[deleteProductAction]", error);
    return {
      error:
        "Bu ürün işlem gördüğü için silinemez, lütfen pasife almayı tercih edin",
    };
  }
}

/** Katalog araması — stok olmasa da ürünleri bulur (mal kabul için). */
export async function searchProductCatalogAction(query: string) {
  const q = query.trim();
  if (q.length < 2) return [];

  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      OR: [
        { referenceCode: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
        { brand: { contains: q, mode: "insensitive" } },
        { barcode: { contains: q, mode: "insensitive" } },
      ],
    },
    include: {
      _count: { select: { stockItems: { where: { isAvailable: true } } } },
    },
    take: 20,
    orderBy: { referenceCode: "asc" },
  });

  return products.map((product) => {
    const size = formatProductSize(product.diameter, product.length);
    const sizePart = size ? ` (${size})` : "";

    return {
      productId: product.id,
      referenceCode: product.referenceCode,
      name: product.name,
      brand: product.brand,
      barcode: product.barcode,
      diameter: product.diameter,
      length: product.length,
      totalCount: product._count.stockItems,
      label: formatProductLabel({
        referenceCode: product.referenceCode,
        name: product.name,
        diameter: product.diameter,
        length: product.length,
        totalCount: product._count.stockItems,
      }),
      shortLabel: `${product.referenceCode} · ${product.name}${sizePart}`,
    };
  });
}
