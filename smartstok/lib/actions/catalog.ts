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
  /** YYYY-MM-DD */
  productionDate: string | null;
  /** YYYY-MM-DD */
  expiryDate: string | null;
  salePrice: string;
  purchasePrice: string | null;
  /** Tüm lokasyonlarda müsait stok */
  stockCount: number;
  /** Yalnızca merkez depo müsait stok (düzenleme formu) */
  mainDepotStockCount: number;
  minStockLevel: number;
  isActive: boolean;
};

function toDateInput(d: Date | null | undefined): string | null {
  if (!d || Number.isNaN(d.getTime())) return null;
  // UTC kayması olmasın diye yerel Y-M-D
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** HTML date (YYYY-MM-DD) → Date (öğlen UTC, TZ kayması yok) */
function parseOptionalDate(value: string | null | undefined): Date | null {
  const s = value?.trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "" / null / undefined → null; aksi halde sayı (çap/boy) */
const optionalPositiveNumber = z.preprocess((v) => {
  if (v === "" || v === null || v === undefined) return null;
  return v;
}, z.coerce.number().positive().nullable());

function prismaErrorMessage(error: unknown): string {
  if (error && typeof error === "object") {
    const e = error as { code?: string; message?: string; meta?: unknown };
    if (e.code === "P2022") {
      return "Veritabanı şeması güncel değil. Sunucuyu yeniden başlatıp tekrar deneyin.";
    }
    if (typeof e.message === "string" && e.message.includes("Unknown argument")) {
      return "Uygulama önbelleği eski. `npm run dev` yeniden başlatın.";
    }
    if (typeof e.message === "string" && e.message.length < 240) {
      return e.message;
    }
  }
  if (error instanceof Error && error.message.length < 240) {
    return error.message;
  }
  return "Ürün güncellenirken bir hata oluştu.";
}

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

  const mainDepot = await ensureMainDepot();

  const products = await prisma.product.findMany({
    where,
    include: {
      _count: { select: { stockItems: { where: { isAvailable: true } } } },
    },
    orderBy: [{ isActive: "desc" }, { brand: "asc" }, { referenceCode: "asc" }],
  });

  const mainCounts = await prisma.stockItem.groupBy({
    by: ["productId"],
    where: {
      locationId: mainDepot.id,
      isAvailable: true,
      productId: { in: products.map((p) => p.id) },
    },
    _count: { _all: true },
  });
  const mainCountByProduct = new Map(
    mainCounts.map((r) => [r.productId, r._count._all]),
  );

  return products.map((p) => ({
    id: p.id,
    referenceCode: p.referenceCode,
    brand: p.brand,
    category: p.category,
    name: p.name,
    diameter: p.diameter,
    length: p.length,
    barcode: p.barcode,
    productionDate: toDateInput(p.productionDate),
    expiryDate: toDateInput(p.expiryDate),
    salePrice: seeSale ? p.salePrice.toString() : "",
    purchasePrice: seePurchase ? p.purchasePrice.toString() : null,
    stockCount: p._count.stockItems,
    mainDepotStockCount: mainCountByProduct.get(p.id) ?? 0,
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
  diameter: optionalPositiveNumber,
  length: optionalPositiveNumber,
  barcode: z.string().trim().optional().nullable(),
  productionDate: z.string().trim().optional().nullable(),
  expiryDate: z.string().trim().optional().nullable(),
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

    const productionDate = parseOptionalDate(parsed.data.productionDate);
    let expiryDate = parseOptionalDate(parsed.data.expiryDate);
    if (productionDate && !expiryDate) {
      expiryDate = new Date(productionDate);
      expiryDate.setFullYear(expiryDate.getFullYear() + 5);
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
        productionDate,
        expiryDate,
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
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { productionDate: true, expiryDate: true },
  });
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
        productionDate: product?.productionDate ?? null,
        expiryDate: product?.expiryDate ?? null,
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

    const productionDate = parseOptionalDate(parsed.data.productionDate);
    let expiryDate = parseOptionalDate(parsed.data.expiryDate);
    if (productionDate && !expiryDate) {
      expiryDate = new Date(productionDate);
      expiryDate.setFullYear(expiryDate.getFullYear() + 5);
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
        productionDate,
        expiryDate,
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
      const mainDepot = await ensureMainDepot();
      const mainCount = await prisma.stockItem.count({
        where: {
          productId: parsed.data.id,
          locationId: mainDepot.id,
          isAvailable: true,
        },
      });
      // Miktar değişmediyse stok senkronu çalıştırma (URT/SKT kaydı şişmesin)
      if (parsed.data.quantity !== mainCount) {
        await syncMainDepotQuantity(parsed.data.id, parsed.data.quantity);
      }
    }

    revalidateProductPaths();
    return { success: true };
  } catch (error) {
    const denied = mutationDeniedMessage(error);
    if (denied) return { error: denied };
    console.error("[updateProductAction]", error);
    return { error: prismaErrorMessage(error) };
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
