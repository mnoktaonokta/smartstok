"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  assertCanMutate,
  mutationDeniedMessage,
} from "@/lib/roles";
import { canAccessCustomerRecord } from "@/lib/portfolio";
import type { UserRole } from "@/types/next-auth";
import type { ActionResult } from "@/lib/actions/customers";

async function assertCustomerAccess(customerId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Oturum bulunamadı." as const, session: null, customer: null };
  }
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, assignedUserId: true },
  });
  if (!customer) {
    return { error: "Müşteri bulunamadı." as const, session, customer: null };
  }
  if (
    !canAccessCustomerRecord(
      customer,
      session.user.id,
      session.user.roles as UserRole[],
    )
  ) {
    return {
      error: "Bu müşteri portföyünüzde değil." as const,
      session,
      customer: null,
    };
  }
  return { error: null, session, customer };
}

export type VisitRow = {
  id: string;
  note: string;
  createdAt: string;
  userName: string;
};

export type TaskRow = {
  id: string;
  title: string;
  dueDate: string;
  isCompleted: boolean;
  createdAt: string;
  userName: string;
};

export type CustomerConsignmentSummary = {
  itemCount: number;
  saleValue: number;
  productLines: Array<{
    referenceCode: string;
    name: string;
    brand: string;
    quantity: number;
    saleValue: number;
  }>;
};

export async function getCustomerConsignmentSummaryAction(
  customerId: string,
): Promise<CustomerConsignmentSummary> {
  const empty: CustomerConsignmentSummary = {
    itemCount: 0,
    saleValue: 0,
    productLines: [],
  };
  if (!customerId) return empty;

  const access = await assertCustomerAccess(customerId);
  if (access.error || !access.customer) return empty;

  const locations = await prisma.location.findMany({
    where: { customerId, type: "CLINIC_DEPOT" },
    select: { id: true },
  });
  if (locations.length === 0) return empty;

  const locationIds = locations.map((l) => l.id);
  const items = await prisma.stockItem.findMany({
    where: {
      locationId: { in: locationIds },
      isAvailable: true,
    },
    select: {
      product: {
        select: {
          id: true,
          referenceCode: true,
          name: true,
          brand: true,
          salePrice: true,
        },
      },
    },
  });

  const byProduct = new Map<
    string,
    {
      referenceCode: string;
      name: string;
      brand: string;
      quantity: number;
      saleValue: number;
    }
  >();

  let saleValue = 0;
  for (const item of items) {
    const price = Number(item.product.salePrice);
    saleValue += price;
    const prev = byProduct.get(item.product.id);
    if (prev) {
      prev.quantity += 1;
      prev.saleValue += price;
    } else {
      byProduct.set(item.product.id, {
        referenceCode: item.product.referenceCode,
        name: item.product.name,
        brand: item.product.brand,
        quantity: 1,
        saleValue: price,
      });
    }
  }

  return {
    itemCount: items.length,
    saleValue,
    productLines: [...byProduct.values()].sort((a, b) =>
      a.referenceCode.localeCompare(b.referenceCode, "tr"),
    ),
  };
}

export async function listVisitsAction(
  customerId: string,
): Promise<VisitRow[]> {
  if (!customerId) return [];
  const access = await assertCustomerAccess(customerId);
  if (access.error) return [];

  const rows = await prisma.visit.findMany({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { fullName: true } } },
  });

  return rows.map((v) => ({
    id: v.id,
    note: v.note,
    createdAt: v.createdAt.toISOString(),
    userName: v.user.fullName,
  }));
}

export async function createVisitAction(input: {
  customerId: string;
  note: string;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { error: "Oturum bulunamadı." };
    }
    assertCanMutate(session.user.roles);

    const parsed = z
      .object({
        customerId: z.string().min(1),
        note: z.string().trim().min(1, "Not gerekli.").max(5000),
      })
      .safeParse(input);

    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Geçersiz form." };
    }

    const access = await assertCustomerAccess(parsed.data.customerId);
    if (access.error) return { error: access.error };

    const visit = await prisma.visit.create({
      data: {
        customerId: parsed.data.customerId,
        userId: session.user.id,
        note: parsed.data.note,
      },
    });

    revalidatePath(`/dashboard/customers/${parsed.data.customerId}`);
    return { success: true, data: { id: visit.id } };
  } catch (error) {
    const denied = mutationDeniedMessage(error);
    if (denied) return { error: denied };
    console.error("[createVisitAction]", error);
    return { error: "Ziyaret notu kaydedilemedi." };
  }
}

export async function listTasksAction(customerId: string): Promise<TaskRow[]> {
  if (!customerId) return [];
  const access = await assertCustomerAccess(customerId);
  if (access.error) return [];

  const rows = await prisma.task.findMany({
    where: { customerId },
    orderBy: [{ isCompleted: "asc" }, { dueDate: "asc" }],
    include: { user: { select: { fullName: true } } },
  });

  return rows.map((t) => ({
    id: t.id,
    title: t.title,
    dueDate: t.dueDate.toISOString(),
    isCompleted: t.isCompleted,
    createdAt: t.createdAt.toISOString(),
    userName: t.user.fullName,
  }));
}

export async function createTaskAction(input: {
  customerId: string;
  title: string;
  dueDate: string;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { error: "Oturum bulunamadı." };
    }
    assertCanMutate(session.user.roles);

    const parsed = z
      .object({
        customerId: z.string().min(1),
        title: z.string().trim().min(2, "Görev başlığı gerekli.").max(300),
        dueDate: z.string().min(1, "Tarih gerekli."),
      })
      .safeParse(input);

    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Geçersiz form." };
    }

    const due = new Date(parsed.data.dueDate);
    if (Number.isNaN(due.getTime())) {
      return { error: "Geçersiz tarih/saat." };
    }

    const access = await assertCustomerAccess(parsed.data.customerId);
    if (access.error) return { error: access.error };

    const task = await prisma.task.create({
      data: {
        customerId: parsed.data.customerId,
        userId: session.user.id,
        title: parsed.data.title,
        dueDate: due,
      },
    });

    revalidatePath(`/dashboard/customers/${parsed.data.customerId}`);
    return { success: true, data: { id: task.id } };
  } catch (error) {
    const denied = mutationDeniedMessage(error);
    if (denied) return { error: denied };
    console.error("[createTaskAction]", error);
    return { error: "Görev oluşturulamadı." };
  }
}

export async function toggleTaskCompletedAction(
  taskId: string,
): Promise<ActionResult<{ isCompleted: boolean }>> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { error: "Oturum bulunamadı." };
    }
    assertCanMutate(session.user.roles);

    if (!taskId) return { error: "Geçersiz görev." };

    const existing = await prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, customerId: true, isCompleted: true },
    });
    if (!existing) return { error: "Görev bulunamadı." };

    const updated = await prisma.task.update({
      where: { id: taskId },
      data: { isCompleted: !existing.isCompleted },
      select: { isCompleted: true },
    });

    revalidatePath(`/dashboard/customers/${existing.customerId}`);
    return { success: true, data: { isCompleted: updated.isCompleted } };
  } catch (error) {
    const denied = mutationDeniedMessage(error);
    if (denied) return { error: denied };
    console.error("[toggleTaskCompletedAction]", error);
    return { error: "Görev güncellenemedi." };
  }
}
