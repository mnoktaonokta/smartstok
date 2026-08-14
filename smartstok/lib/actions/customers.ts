"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { assertCanMutate, hasRole, isPortfolioScopedSales, mutationDeniedMessage } from "@/lib/roles";
import {
  canAccessCustomerRecord,
  customerPortfolioWhere,
} from "@/lib/portfolio";
import type { UserRole } from "@/types/next-auth";

export type ActionResult<T = undefined> = {
  error?: string;
  success?: boolean;
  data?: T;
};

const vknSchema = z
  .string()
  .trim()
  .regex(/^\d{10,11}$/, "VKN 10, TCKN 11 haneli olmalıdır.");

const createCustomerSchema = z
  .object({
    vknTckn: vknSchema,
    name: z.string().trim().min(2, "Ünvan gerekli."),
    taxOffice: z.string().trim().optional().nullable(),
    address: z.string().trim().optional().nullable(),
    phone: z.string().trim().optional().nullable(),
    bizimHesapId: z.string().trim().optional().nullable(),
    utsInstitutionNumber: z.string().trim().optional().nullable(),
    assignedUserId: z.string().min(1).optional().nullable(),
    isPublicEntity: z.boolean(),
    spendingUnitVkn: z.string().trim().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (!data.isPublicEntity) return;
    const unit = (data.spendingUnitVkn ?? "").replace(/\D/g, "");
    if (!/^\d{10}$/.test(unit)) {
      ctx.addIssue({
        code: "custom",
        path: ["spendingUnitVkn"],
        message: "Kamu kurumu için Harcama Birimi VKN (10 hane) zorunludur.",
      });
      return;
    }
    if (unit === data.vknTckn.replace(/\D/g, "")) {
      ctx.addIssue({
        code: "custom",
        path: ["spendingUnitVkn"],
        message: "Harcama Birimi VKN, ana VKN’den farklı olmalıdır.",
      });
    }
  });

export async function createCustomerWithDepotAction(
  input: z.infer<typeof createCustomerSchema>,
): Promise<ActionResult<{ customerId: string }>> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { error: "Oturum bulunamadı." };
    }
    assertCanMutate(session.user.roles);

    const parsed = createCustomerSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Geçersiz form." };
    }

    const existing = await prisma.customer.findUnique({
      where: { vknTckn: parsed.data.vknTckn },
    });

    if (existing) {
      return { error: "Bu VKN/TCKN ile kayıtlı müşteri zaten var." };
    }

    // Saha (portföy kapsamlı) → otomatik kendine ata
    let assignedUserId: string | null = null;
    if (isPortfolioScopedSales(session.user.roles)) {
      assignedUserId = session.user.id;
    } else if (parsed.data.assignedUserId) {
      const rep = await prisma.user.findFirst({
        where: {
          id: parsed.data.assignedUserId,
          isActive: true,
          roles: { has: "SAHA" },
        },
        select: { id: true },
      });
      if (!rep) {
        return { error: "Seçilen temsilci geçersiz veya Saha Satış yetkisi yok." };
      }
      assignedUserId = rep.id;
    }

    const created = await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.create({
        data: {
          vknTckn: parsed.data.vknTckn,
          name: parsed.data.name,
          taxOffice: parsed.data.taxOffice || null,
          address: parsed.data.address || null,
          phone: parsed.data.phone || null,
          bizimHesapId: parsed.data.bizimHesapId || null,
          utsInstitutionNumber: parsed.data.utsInstitutionNumber || null,
          isPublicEntity: parsed.data.isPublicEntity,
          spendingUnitVkn: parsed.data.isPublicEntity
            ? (parsed.data.spendingUnitVkn ?? "").replace(/\D/g, "")
            : null,
          assignedUserId,
        },
      });

      await tx.location.create({
        data: {
          name: `${customer.name} Konsinye Deposu`,
          type: "CLINIC_DEPOT",
          customerId: customer.id,
        },
      });

      return customer;
    });

    revalidatePath("/dashboard/customers");
    revalidatePath("/dashboard/transfers");

    return { success: true, data: { customerId: created.id } };
  } catch (error) {
    const denied = mutationDeniedMessage(error);
    if (denied) return { error: denied };
    console.error(error);
    return { error: "Müşteri oluşturulurken bir hata oluştu." };
  }
}

export async function getCustomersAction() {
  const session = await auth();
  const where = customerPortfolioWhere(
    session?.user?.id,
    session?.user?.roles as UserRole[] | undefined,
  );

  return prisma.customer.findMany({
    where,
    include: {
      locations: {
        where: { type: "CLINIC_DEPOT" },
        take: 1,
      },
      assignedUser: {
        select: { id: true, fullName: true },
      },
    },
    orderBy: { name: "asc" },
  });
}

export async function getCustomerDetailAction(customerId: string) {
  if (!customerId) return null;

  const session = await auth();
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: {
      locations: {
        where: { type: "CLINIC_DEPOT" },
        orderBy: { createdAt: "asc" },
      },
      assignedUser: {
        select: { id: true, fullName: true, email: true },
      },
      _count: {
        select: { invoices: true },
      },
    },
  });

  if (!customer) return null;

  if (
    !canAccessCustomerRecord(
      customer,
      session?.user?.id,
      session?.user?.roles as UserRole[] | undefined,
    )
  ) {
    return null;
  }

  return customer;
}

export type SahaRepOption = {
  id: string;
  fullName: string;
};

/** Saha Satış yetkili aktif personeller (temsilci seçimi) */
export async function listSahaRepsAction(): Promise<SahaRepOption[]> {
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      roles: { has: "SAHA" },
    },
    select: { id: true, fullName: true },
    orderBy: { fullName: "asc" },
  });
  return users;
}

export async function assignCustomerRepAction(input: {
  customerId: string;
  assignedUserId: string | null;
}): Promise<ActionResult> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { error: "Oturum bulunamadı." };
    }
    if (!hasRole(session.user.roles, "ADMIN")) {
      return { error: "Temsilci ataması yalnızca Admin tarafından yapılabilir." };
    }

    const parsed = z
      .object({
        customerId: z.string().min(1),
        assignedUserId: z.string().min(1).nullable(),
      })
      .safeParse(input);

    if (!parsed.success) {
      return { error: "Geçersiz istek." };
    }

    const customer = await prisma.customer.findUnique({
      where: { id: parsed.data.customerId },
      select: { id: true },
    });
    if (!customer) return { error: "Müşteri bulunamadı." };

    if (parsed.data.assignedUserId) {
      const rep = await prisma.user.findFirst({
        where: {
          id: parsed.data.assignedUserId,
          isActive: true,
          roles: { has: "SAHA" },
        },
        select: { id: true },
      });
      if (!rep) {
        return { error: "Seçilen kullanıcı Saha Satış yetkisine sahip değil." };
      }
    }

    await prisma.customer.update({
      where: { id: parsed.data.customerId },
      data: { assignedUserId: parsed.data.assignedUserId },
    });

    revalidatePath("/dashboard/customers");
    revalidatePath(`/dashboard/customers/${parsed.data.customerId}`);
    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    console.error("[assignCustomerRepAction]", error);
    return { error: "Temsilci atanamadı." };
  }
}

const updateCustomerSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().trim().min(2, "Ünvan gerekli."),
    taxOffice: z.string().trim().optional().nullable(),
    address: z.string().trim().optional().nullable(),
    phone: z.string().trim().optional().nullable(),
    bizimHesapId: z.string().trim().optional().nullable(),
    utsInstitutionNumber: z.string().trim().optional().nullable(),
    isPublicEntity: z.boolean(),
    spendingUnitVkn: z.string().trim().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (!data.isPublicEntity) return;
    const unit = (data.spendingUnitVkn ?? "").replace(/\D/g, "");
    if (!/^\d{10}$/.test(unit)) {
      ctx.addIssue({
        code: "custom",
        path: ["spendingUnitVkn"],
        message: "Kamu kurumu için Harcama Birimi VKN (10 hane) zorunludur.",
      });
    }
  });

export async function updateCustomerAction(
  input: z.infer<typeof updateCustomerSchema>,
): Promise<ActionResult> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { error: "Oturum bulunamadı." };
    }
    assertCanMutate(session.user.roles);

    const parsed = updateCustomerSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Geçersiz form." };
    }

    const existing = await prisma.customer.findUnique({
      where: { id: parsed.data.id },
      include: {
        locations: { where: { type: "CLINIC_DEPOT" } },
      },
    });

    if (!existing) {
      return { error: "Müşteri bulunamadı." };
    }

    if (
      !canAccessCustomerRecord(
        existing,
        session.user.id,
        session.user.roles as UserRole[],
      )
    ) {
      return { error: "Bu müşteri portföyünüzde değil." };
    }

    if (
      parsed.data.isPublicEntity &&
      (parsed.data.spendingUnitVkn ?? "").replace(/\D/g, "") ===
        existing.vknTckn.replace(/\D/g, "")
    ) {
      return {
        error: "Harcama Birimi VKN, ana VKN’den farklı olmalıdır.",
      };
    }

    await prisma.$transaction(async (tx) => {
      await tx.customer.update({
        where: { id: parsed.data.id },
        data: {
          name: parsed.data.name,
          taxOffice: parsed.data.taxOffice || null,
          address: parsed.data.address || null,
          phone: parsed.data.phone || null,
          bizimHesapId: parsed.data.bizimHesapId || null,
          utsInstitutionNumber: parsed.data.utsInstitutionNumber || null,
          isPublicEntity: parsed.data.isPublicEntity,
          spendingUnitVkn: parsed.data.isPublicEntity
            ? (parsed.data.spendingUnitVkn ?? "").replace(/\D/g, "")
            : null,
        },
      });

      // Konsinye depo adını ünvanla senkron tut
      for (const location of existing.locations) {
        await tx.location.update({
          where: { id: location.id },
          data: { name: `${parsed.data.name} Konsinye Deposu` },
        });
      }
    });

    revalidatePath("/dashboard/customers");
    revalidatePath(`/dashboard/customers/${parsed.data.id}`);
    revalidatePath("/dashboard/transfers");

    return { success: true };
  } catch (error) {
    const denied = mutationDeniedMessage(error);
    if (denied) return { error: denied };
    console.error("[updateCustomerAction]", error);
    const msg =
      error instanceof Error
        ? error.message.replace(/\s+/g, " ").trim().slice(0, 280)
        : "";
    if (
      /isPublicEntity|spendingUnitVkn|Unknown argument|column .* does not exist/i.test(
        msg,
      )
    ) {
      return {
        error:
          "Kamu alanları veritabanında yok veya Prisma istemcisi eski. Proje kökünde `npx prisma db push` ve `npx prisma generate` çalıştırıp sunucuyu yeniden başlatın.",
      };
    }
    return {
      error: msg
        ? `Müşteri güncellenemedi: ${msg}`
        : "Müşteri güncellenirken bir hata oluştu.",
    };
  }
}

export async function deleteCustomerAction(
  customerId: string,
): Promise<ActionResult> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { error: "Oturum bulunamadı." };
    }
    assertCanMutate(session.user.roles);

    if (!hasRole(session.user.roles, "ADMIN")) {
      return { error: "Müşteri silme yalnızca Admin yetkisiyle yapılabilir." };
    }

    if (!customerId) {
      return { error: "Geçersiz müşteri." };
    }

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        locations: true,
      },
    });

    if (!customer) {
      return { error: "Müşteri bulunamadı." };
    }

    const locationIds = customer.locations.map((l) => l.id);

    if (locationIds.length > 0) {
      const stockCount = await prisma.stockItem.count({
        where: { locationId: { in: locationIds } },
      });

      if (stockCount > 0) {
        return {
          error: `Bu müşterinin konsinye deposunda ${stockCount} adet stok var. Önce stokları geri alın veya satışı tamamlayın.`,
        };
      }

      const transferCount = await prisma.transferLog.count({
        where: {
          OR: [
            { fromLocationId: { in: locationIds } },
            { toLocationId: { in: locationIds } },
          ],
        },
      });

      if (transferCount > 0) {
        return {
          error:
            "Bu müşteriye ait transfer geçmişi bulunduğu için silinemez. Kayıt geçmişi korunmalıdır.",
        };
      }
    }

    await prisma.$transaction(async (tx) => {
      if (locationIds.length > 0) {
        await tx.location.deleteMany({
          where: { id: { in: locationIds } },
        });
      }

      await tx.customer.delete({
        where: { id: customerId },
      });
    });

    revalidatePath("/dashboard/customers");
    revalidatePath("/dashboard/transfers");

    return { success: true };
  } catch (error) {
    const denied = mutationDeniedMessage(error);
    if (denied) return { error: denied };
    console.error(error);
    return { error: "Müşteri silinirken bir hata oluştu." };
  }
}

/** VKN ile ÜTS kurum numarası sorgular. */
export async function fetchUtsKurumNoByVknAction(
  vkn: string,
): Promise<ActionResult<string>> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { error: "Oturum bulunamadı." };
    }
    assertCanMutate(session.user.roles);

    const parsed = vknSchema.safeParse(vkn);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Geçersiz VKN/TCKN." };
    }

    const { fetchUtsKurumNoByVKN } = await import("@/lib/uts-api");
    const kurumNo = await fetchUtsKurumNoByVKN(parsed.data);
    return { success: true, data: kurumNo };
  } catch (error) {
    const denied = mutationDeniedMessage(error);
    if (denied) return { error: denied };
    console.error("[fetchUtsKurumNoByVknAction]", error);
    return {
      error:
        error instanceof Error
          ? error.message
          : "ÜTS kurum sorgusu başarısız oldu.",
    };
  }
}
