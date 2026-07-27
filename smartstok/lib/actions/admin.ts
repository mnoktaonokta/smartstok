"use server";

import { revalidatePath } from "next/cache";
import { hash } from "bcryptjs";
import * as XLSX from "xlsx";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ensureMainDepot } from "@/lib/inventory";
import { syncCustomersFromBizimHesapAction } from "@/lib/actions/bizim-hesap";
import {
  hasRole,
  normalizeRoles,
} from "@/lib/roles";
import type { UserRole } from "@/types/next-auth";

const roleEnum = z.enum(["ADMIN", "SAHA", "DEPO", "MUHASEBE", "OBSERVER"]);

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Oturum bulunamadı." as const, session: null };
  }
  if (!hasRole(session.user.roles, "ADMIN")) {
    return { error: "Bu işlem için ADMIN yetkisi gerekli." as const, session: null };
  }
  return { error: null, session };
}

const createUserSchema = z.object({
  email: z.string().email("Geçerli e-posta girin."),
  fullName: z.string().trim().min(2, "Ad soyad gerekli."),
  password: z.string().min(8, "Şifre en az 8 karakter olmalı."),
  roles: z.array(roleEnum).min(1, "En az bir yetki seçin."),
});

export async function createStaffUserAction(input: {
  email: string;
  fullName: string;
  password: string;
  roles: UserRole[];
}): Promise<{ error?: string; success?: boolean }> {
  try {
    const gate = await requireAdmin();
    if (gate.error) return { error: gate.error };

    const parsed = createUserSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Geçersiz form." };
    }

    const email = parsed.data.email.toLowerCase().trim();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return { error: "Bu e-posta ile kayıtlı kullanıcı zaten var." };
    }

    const roles = normalizeRoles(parsed.data.roles);
    if (roles.length === 0) {
      return { error: "En az bir yetki seçin." };
    }

    const hashedPassword = await hash(parsed.data.password, 12);

    await prisma.user.create({
      data: {
        email,
        fullName: parsed.data.fullName.trim(),
        hashedPassword,
        roles,
        forcePasswordChange: true,
        isActive: true,
      },
    });

    revalidatePath("/dashboard/admin");
    return { success: true };
  } catch (error) {
    console.error("[createStaffUserAction]", error);
    if (
      error instanceof Error &&
      /Invalid value for argument `roles`/i.test(error.message)
    ) {
      return {
        error:
          "Rol değeri veritabanı/istemci ile uyumsuz. Geliştirme sunucusunu yeniden başlatıp tekrar deneyin.",
      };
    }
    return { error: "Kullanıcı oluşturulurken bir hata oluştu." };
  }
}

export async function listUsersAction(): Promise<
  Array<{
    id: string;
    email: string;
    fullName: string;
    roles: UserRole[];
    isActive: boolean;
    createdAt: string;
  }>
> {
  const gate = await requireAdmin();
  if (gate.error) return [];

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      fullName: true,
      roles: true,
      isActive: true,
      createdAt: true,
    },
    take: 100,
  });

  return users.map((u) => ({
    ...u,
    roles: u.roles as UserRole[],
    createdAt: u.createdAt.toISOString(),
  }));
}

const updateUserSchema = z.object({
  id: z.string().min(1),
  email: z.string().email("Geçerli e-posta girin."),
  fullName: z.string().trim().min(2, "Ad soyad gerekli."),
  roles: z.array(roleEnum).min(1, "En az bir yetki seçin."),
  newPassword: z
    .string()
    .optional()
    .transform((v) => (v ?? "").trim())
    .refine((v) => v.length === 0 || v.length >= 8, {
      message: "Yeni şifre en az 8 karakter olmalı.",
    }),
});

export async function updateUserAction(input: {
  id: string;
  email: string;
  fullName: string;
  roles: UserRole[];
  newPassword?: string;
}): Promise<{ error?: string; success?: boolean; message?: string }> {
  try {
    const gate = await requireAdmin();
    if (gate.error || !gate.session) return { error: gate.error ?? "Yetkisiz." };

    const parsed = updateUserSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Geçersiz form." };
    }

    const roles = normalizeRoles(parsed.data.roles);
    if (roles.length === 0) {
      return { error: "En az bir yetki seçin." };
    }

    const target = await prisma.user.findUnique({
      where: { id: parsed.data.id },
      select: { id: true, roles: true, email: true },
    });
    if (!target) {
      return { error: "Kullanıcı bulunamadı." };
    }

    const isSelf = gate.session.user.id === target.id;
    const hadAdmin = hasRole(target.roles as UserRole[], "ADMIN");
    const keepsAdmin = roles.includes("ADMIN");

    if (isSelf && hadAdmin && !keepsAdmin) {
      return {
        error:
          "Kendi hesabınızdan Admin yetkisini kaldıramazsınız. En az bir Admin kalmalıdır.",
      };
    }

    const email = parsed.data.email.toLowerCase().trim();
    const emailTaken = await prisma.user.findFirst({
      where: { email, id: { not: parsed.data.id } },
      select: { id: true },
    });
    if (emailTaken) {
      return { error: "Bu e-posta başka bir kullanıcıda kayıtlı." };
    }

    const data: {
      email: string;
      fullName: string;
      roles: UserRole[];
      hashedPassword?: string;
      forcePasswordChange?: boolean;
    } = {
      email,
      fullName: parsed.data.fullName.trim(),
      roles,
    };

    if (parsed.data.newPassword) {
      data.hashedPassword = await hash(parsed.data.newPassword, 12);
      // Admin atadığı şifreyi kullanıcı hemen kullanır; zorunlu değişim yok
    }

    await prisma.user.update({
      where: { id: parsed.data.id },
      data,
    });

    revalidatePath("/dashboard/admin");
    return {
      success: true,
      message: "Kullanıcı başarıyla güncellendi",
    };
  } catch (error) {
    console.error("[updateUserAction]", error);
    return { error: "Kullanıcı güncellenirken bir hata oluştu." };
  }
}

export async function deleteUserAction(
  userId: string,
): Promise<{ error?: string; success?: boolean; message?: string }> {
  try {
    const gate = await requireAdmin();
    if (gate.error || !gate.session) return { error: gate.error ?? "Yetkisiz." };

    if (!userId) return { error: "Geçersiz kullanıcı." };

    if (gate.session.user.id === userId) {
      return { error: "Kendi hesabınızı silemezsiniz." };
    }

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!target) return { error: "Kullanıcı bulunamadı." };

    // Transfer geçmişi olan kullanıcı silinemez (FK)
    const transferRef = await prisma.transferLog.count({
      where: {
        OR: [{ executedById: userId }, { requestedById: userId }],
      },
    });
    if (transferRef > 0) {
      return {
        error:
          "Bu kullanıcının transfer kayıtları var; silinemez. İsterseniz pasife alınabilir (ileride).",
      };
    }

    await prisma.user.delete({ where: { id: userId } });
    revalidatePath("/dashboard/admin");
    return { success: true, message: "Kullanıcı silindi." };
  } catch (error) {
    console.error("[deleteUserAction]", error);
    return {
      error:
        "Kullanıcı silinemedi. Bağlı kayıtlar olabilir.",
    };
  }
}

/** Müşteri sync — admin paneli üzerinden (yetki kontrolü ile) */
export async function adminSyncCustomersAction() {
  const gate = await requireAdmin();
  if (gate.error) return { error: gate.error };
  return syncCustomersFromBizimHesapAction();
}

function cellStr(row: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  const lowerMap = new Map(
    Object.keys(row).map((k) => [k.toLocaleLowerCase("tr-TR"), k]),
  );
  for (const k of keys) {
    const real = lowerMap.get(k.toLocaleLowerCase("tr-TR"));
    if (real != null && row[real] != null && String(row[real]).trim()) {
      return String(row[real]).trim();
    }
  }
  return "";
}

function cellNum(row: Record<string, unknown>, keys: string[]): number {
  const s = cellStr(row, keys).replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Excel/CSV ürün importu.
 * Sütunlar: Referans, Ad, Marka, Kategori, Barkod, Çap, Boy, Miktar, Fiyat
 * Kategori Excel'deki metin olarak (trim) birebir kaydedilir.
 */
export async function importProductsAction(
  formData: FormData,
): Promise<{
  error?: string;
  imported?: number;
  updated?: number;
  skipped?: number;
  message?: string;
}> {
  try {
    const gate = await requireAdmin();
    if (gate.error) return { error: gate.error };

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { error: "Lütfen bir Excel veya CSV dosyası seçin." };
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return { error: "Dosyada sayfa bulunamadı." };

    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
    });

    if (rows.length === 0) {
      return { error: "Dosya boş veya başlık satırı okunamadı." };
    }

    const mainDepot = await ensureMainDepot();
    let imported = 0;
    let updated = 0;
    let skipped = 0;
    const lotNumber = `IMP-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;

    for (const row of rows) {
      const name = cellStr(row, ["Ad", "Name", "Ürün", "Ürün Adı", "urun", "product"]);
      const barcode = cellStr(row, ["Barkod", "Barcode", "barcode", "EAN"]);
      const referenceCode = cellStr(row, [
        "Referans",
        "Referans Kodu",
        "Reference",
        "ReferenceCode",
        "referenceCode",
        "Kod",
        "SKU",
      ]);
      const brand = cellStr(row, ["Marka", "Brand", "brand"]) || "İçe Aktarım";
      const categoryRaw = cellStr(row, [
        "Kategori",
        "Category",
        "category",
        "Tip",
      ]);
      const diameter = cellNum(row, ["Çap", "Cap", "Diameter", "diameter", "Ø"]);
      const length = cellNum(row, [
        "Boy",
        "Uzunluk",
        "Length",
        "length",
        "L",
      ]);
      const qty = Math.max(
        0,
        Math.floor(cellNum(row, ["Miktar", "Quantity", "Adet", "qty", "Stok"])),
      );
      const salePrice = cellNum(row, [
        "Fiyat",
        "Satış Fiyatı",
        "SalePrice",
        "salePrice",
        "Price",
      ]);
      const purchasePrice = cellNum(row, [
        "Alış Fiyatı",
        "Alis Fiyati",
        "PurchasePrice",
        "purchasePrice",
        "Alış",
      ]);

      if (!name && !barcode && !referenceCode) {
        skipped += 1;
        continue;
      }

      const productName = name || `Ürün ${barcode || referenceCode}`;
      const ref =
        referenceCode ||
        barcode ||
        `IMP-${productName
          .replace(/\s+/g, "-")
          .slice(0, 24)
          .toUpperCase()}-${Date.now().toString(36).slice(-4)}`;

      const category = categoryRaw.trim();
      const finalSale = salePrice > 0 ? salePrice : purchasePrice;
      const finalPurchase = purchasePrice > 0 ? purchasePrice : salePrice;

      let product = barcode
        ? await prisma.product.findUnique({ where: { barcode } })
        : null;

      if (!product) {
        product = await prisma.product.findUnique({
          where: { referenceCode: ref },
        });
      }

      const sizeData = {
        ...(diameter > 0 ? { diameter } : {}),
        ...(length > 0 ? { length } : {}),
      };

      if (product) {
        await prisma.product.update({
          where: { id: product.id },
          data: {
            name: productName,
            brand,
            ...(category ? { category } : {}),
            ...(barcode ? { barcode } : {}),
            ...(referenceCode ? { referenceCode: ref } : {}),
            ...(finalSale > 0 ? { salePrice: finalSale } : {}),
            ...(finalPurchase > 0 ? { purchasePrice: finalPurchase } : {}),
            ...sizeData,
          },
        });
        updated += 1;
      } else {
        if (!category) {
          skipped += 1;
          continue;
        }
        product = await prisma.product.create({
          data: {
            referenceCode: ref,
            name: productName,
            brand,
            category,
            barcode: barcode || null,
            purchasePrice: finalPurchase > 0 ? finalPurchase : 0,
            salePrice: finalSale > 0 ? finalSale : 0,
            diameter: diameter > 0 ? diameter : null,
            length: length > 0 ? length : null,
          },
        });
        imported += 1;
      }

      if (qty > 0) {
        await prisma.stockItem.createMany({
          data: Array.from({ length: Math.min(qty, 5000) }, () => ({
            productId: product!.id,
            lotNumber,
            locationId: mainDepot.id,
            isAvailable: true,
          })),
        });
      }
    }

    revalidatePath("/dashboard/products");
    revalidatePath("/dashboard/depots");
    revalidatePath("/dashboard/admin");
    revalidatePath("/dashboard");

    return {
      imported,
      updated,
      skipped,
      message: `${imported} ürün eklendi, ${updated} güncellendi${skipped ? `, ${skipped} satır atlandı` : ""}.`,
    };
  } catch (error) {
    console.error("[importProductsAction]", error);
    const detail =
      error &&
      typeof error === "object" &&
      "message" in error &&
      typeof (error as { message: unknown }).message === "string"
        ? (error as { message: string }).message.split("\n")[0]
        : null;
    return {
      error: detail
        ? `Ürün içe aktarımı sırasında bir hata oluştu: ${detail}`
        : "Ürün içe aktarımı sırasında bir hata oluştu.",
    };
  }
}

export type CountLookupResult = {
  error?: string;
  notFound?: boolean;
  barcode?: string;
  product?: {
    id: string;
    name: string;
    referenceCode: string;
    barcode: string | null;
    currentQty: number;
    salePrice: number;
  };
};

export async function lookupProductByBarcodeAction(
  barcode: string,
): Promise<CountLookupResult> {
  const gate = await requireAdmin();
  if (gate.error) return { error: gate.error };

  const code = barcode.trim();
  if (!code) return { error: "Barkod gerekli." };

  const product = await prisma.product.findFirst({
    where: {
      OR: [
        { barcode: code },
        { referenceCode: { equals: code, mode: "insensitive" } },
      ],
    },
  });

  if (!product) {
    return { notFound: true, barcode: code };
  }

  const mainDepot = await ensureMainDepot();
  const currentQty = await prisma.stockItem.count({
    where: {
      productId: product.id,
      locationId: mainDepot.id,
      isAvailable: true,
    },
  });

  return {
    product: {
      id: product.id,
      name: product.name,
      referenceCode: product.referenceCode,
      barcode: product.barcode,
      currentQty,
      salePrice: Number(product.salePrice),
    },
  };
}

export async function applyStockCountAction(input: {
  productId: string;
  newQuantity: number;
}): Promise<{ error?: string; success?: boolean; currentQty?: number }> {
  try {
    const gate = await requireAdmin();
    if (gate.error) return { error: gate.error };

    const qty = Math.floor(Number(input.newQuantity));
    if (!Number.isFinite(qty) || qty < 0) {
      return { error: "Miktar 0 veya pozitif tam sayı olmalı." };
    }
    if (qty > 10000) {
      return { error: "Tek seferde en fazla 10000 adet." };
    }

    const product = await prisma.product.findUnique({
      where: { id: input.productId },
    });
    if (!product) return { error: "Ürün bulunamadı." };

    const mainDepot = await ensureMainDepot();
    const available = await prisma.stockItem.findMany({
      where: {
        productId: product.id,
        locationId: mainDepot.id,
        isAvailable: true,
      },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });

    const current = available.length;
    const lotNumber = `SAYIM-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;

    if (qty > current) {
      const add = qty - current;
      await prisma.stockItem.createMany({
        data: Array.from({ length: add }, () => ({
          productId: product.id,
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

    revalidatePath("/dashboard/depots");
    revalidatePath("/dashboard/products");
    revalidatePath("/dashboard/admin");
    revalidatePath("/dashboard");

    return { success: true, currentQty: qty };
  } catch (error) {
    console.error("[applyStockCountAction]", error);
    return { error: "Stok sayımı güncellenirken bir hata oluştu." };
  }
}

export async function quickAddProductForCountAction(input: {
  barcode: string;
  name: string;
  price: number;
  quantity: number;
}): Promise<{ error?: string; success?: boolean; productId?: string }> {
  try {
    const gate = await requireAdmin();
    if (gate.error) return { error: gate.error };

    const barcode = input.barcode.trim();
    const name = input.name.trim();
    const qty = Math.floor(Number(input.quantity));
    const price = Number(input.price);

    if (!barcode) return { error: "Barkod gerekli." };
    if (name.length < 2) return { error: "Ürün adı gerekli." };
    if (!Number.isFinite(qty) || qty < 0) {
      return { error: "Miktar geçersiz." };
    }

    const existing = await prisma.product.findUnique({ where: { barcode } });
    if (existing) {
      return { error: "Bu barkod zaten kayıtlı." };
    }

    const mainDepot = await ensureMainDepot();
    const referenceCode = `Q-${barcode.slice(0, 20)}`;

    const product = await prisma.product.create({
      data: {
        referenceCode,
        name,
        brand: "Sayım",
        category: "Belirtilmedi",
        barcode,
        purchasePrice: price > 0 ? price : 0,
        salePrice: price > 0 ? price : 0,
      },
    });

    if (qty > 0) {
      const lotNumber = `SAYIM-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;
      await prisma.stockItem.createMany({
        data: Array.from({ length: Math.min(qty, 5000) }, () => ({
          productId: product.id,
          lotNumber,
          locationId: mainDepot.id,
          isAvailable: true,
        })),
      });
    }

    revalidatePath("/dashboard/products");
    revalidatePath("/dashboard/depots");
    revalidatePath("/dashboard/admin");

    return { success: true, productId: product.id };
  } catch (error) {
    console.error("[quickAddProductForCountAction]", error);
    return { error: "Hızlı ürün ekleme başarısız." };
  }
}

export type CategoryStockBucket = {
  key: "implant" | "abutment" | "ara_parca";
  label: string;
  description: string;
  total: number;
  mainDepot: number;
  clinicDepot: number;
  percent: number;
};

export type CategoryStockBreakdown = {
  total: number;
  buckets: CategoryStockBucket[];
};

function normalizeCategoryKey(
  raw: string,
): CategoryStockBucket["key"] | "other" {
  const c = raw.trim().toLocaleLowerCase("tr-TR");

  if (c.includes("implant")) return "implant";
  if (c.includes("abutment")) return "abutment";
  if (
    c.includes("ara parça") ||
    c.includes("ara parca") ||
    c.includes("healing") ||
    c.includes("transfer")
  ) {
    return "ara_parca";
  }
  return "other";
}

/** Admin: kategori bazlı stok (merkez vs müşteri deposu) */
export async function getCategoryStockBreakdownAction(): Promise<CategoryStockBreakdown> {
  const gate = await requireAdmin();
  if (gate.error) {
    return { total: 0, buckets: [] };
  }

  const items = await prisma.stockItem.findMany({
    where: { isAvailable: true },
    select: {
      product: { select: { category: true } },
      location: { select: { type: true } },
    },
  });

  const tallies: Record<
    CategoryStockBucket["key"],
    { main: number; clinic: number }
  > = {
    implant: { main: 0, clinic: 0 },
    abutment: { main: 0, clinic: 0 },
    ara_parca: { main: 0, clinic: 0 },
  };

  for (const item of items) {
    const key = normalizeCategoryKey(item.product.category ?? "");
    if (key === "other") continue;
    if (item.location.type === "MAIN_DEPOT") {
      tallies[key].main += 1;
    } else if (item.location.type === "CLINIC_DEPOT") {
      tallies[key].clinic += 1;
    }
  }

  const meta: Array<{
    key: CategoryStockBucket["key"];
    label: string;
    description: string;
  }> = [
    {
      key: "implant",
      label: "İmplant",
      description: "Vida ve implant gövdesi stokları",
    },
    {
      key: "abutment",
      label: "Abutment",
      description: "Abutment ve üst yapı parçaları",
    },
    {
      key: "ara_parca",
      label: "Ara Parça",
      description: "Ara bağlantı, transfer, vida vb.",
    },
  ];

  const bucketsRaw = meta.map((m) => {
    const mainDepot = tallies[m.key].main;
    const clinicDepot = tallies[m.key].clinic;
    return {
      ...m,
      total: mainDepot + clinicDepot,
      mainDepot,
      clinicDepot,
    };
  });

  const total = bucketsRaw.reduce((s, b) => s + b.total, 0);

  return {
    total,
    buckets: bucketsRaw.map((b) => ({
      ...b,
      percent: total > 0 ? Math.round((b.total / total) * 100) : 0,
    })),
  };
}
