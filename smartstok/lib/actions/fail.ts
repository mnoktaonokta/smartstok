"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  ensureFailHoldDepot,
  ensureMainDepot,
  ensureOpenFailCycle,
  ensureSupplierPendingDepot,
} from "@/lib/inventory";
import {
  assertCanMutate,
  canAccessFailManagement,
  mutationDeniedMessage,
} from "@/lib/roles";
import { canAccessCustomerRecord } from "@/lib/portfolio";
import {
  compareSupplierReceipt,
  type SupplierReceiptCompare,
} from "@/lib/fail/compare";
import type { UserRole } from "@/types/next-auth";
import type { FailShipmentPreview } from "@/lib/fail/types";

function revalidateFailPaths(extra?: string) {
  revalidatePath("/dashboard/fail-yonetimi");
  revalidatePath("/dashboard/depots");
  revalidatePath("/dashboard");
  if (extra) revalidatePath(extra);
}

async function requireFailAccess(mutate: boolean) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Oturum bulunamadı." as const, session: null };
  }
  const roles = session.user.roles as UserRole[];
  if (!canAccessFailManagement(roles)) {
    return { error: "Bu sayfaya erişim yetkiniz yok." as const, session: null };
  }
  if (mutate) {
    try {
      assertCanMutate(roles);
    } catch (e) {
      return {
        error: mutationDeniedMessage(e) ?? "Değişiklik yapılamaz.",
        session: null,
      };
    }
  }
  return { error: null, session };
}

export type FailGiveScanResult =
  | {
      ok: true;
      productId: string;
      barcode: string;
      referenceCode: string;
      productName: string;
      brand: string;
      lots: Array<{ lotNumber: string; available: number; source: "CLINIC" | "MAIN" }>;
      autoLotNumber: string | null;
    }
  | { ok: false; error: string };

/** Konsinye önce, sonra merkez — lot bazlı müsaitlik */
export async function scanBarcodeForFailGiveAction(
  barcode: string,
  customerId: string,
): Promise<FailGiveScanResult> {
  try {
    const gate = await requireFailAccess(false);
    if (gate.error) return { ok: false, error: gate.error };

    const cleaned = barcode.trim();
    if (!cleaned) return { ok: false, error: "Barkod boş olamaz." };
    if (!customerId) return { ok: false, error: "Müşteri seçilmeli." };

    const product = await prisma.product.findFirst({
      where: { OR: [{ barcode: cleaned }, { referenceCode: cleaned }] },
    });
    if (!product) {
      return { ok: false, error: "HATA: Bu barkod / referans sistemde tanımlı değil!" };
    }

    const clinic = await prisma.location.findFirst({
      where: { customerId, type: "CLINIC_DEPOT" },
    });
    const main = await ensureMainDepot();

    const locationIds = [clinic?.id, main.id].filter(Boolean) as string[];
    const stockItems = await prisma.stockItem.findMany({
      where: {
        productId: product.id,
        locationId: { in: locationIds },
        isAvailable: true,
      },
      select: { lotNumber: true, locationId: true },
      orderBy: { createdAt: "asc" },
    });

    if (stockItems.length === 0) {
      return {
        ok: false,
        error: "Bu ürün müşteri konsinyesinde veya merkez depoda yok.",
      };
    }

    type LotAgg = { lotNumber: string; available: number; source: "CLINIC" | "MAIN" };
    const lotMap = new Map<string, LotAgg>();
    for (const item of stockItems) {
      const source: "CLINIC" | "MAIN" =
        clinic && item.locationId === clinic.id ? "CLINIC" : "MAIN";
      const key = `${item.lotNumber}::${source}`;
      const existing = lotMap.get(key);
      if (existing) existing.available += 1;
      else {
        lotMap.set(key, { lotNumber: item.lotNumber, available: 1, source });
      }
    }

    const lots = Array.from(lotMap.values()).sort((a, b) => {
      if (a.source !== b.source) return a.source === "CLINIC" ? -1 : 1;
      return a.lotNumber.localeCompare(b.lotNumber);
    });

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
    console.error("[scanBarcodeForFailGiveAction]", error);
    return { ok: false, error: "Barkod sorgusu sırasında bir hata oluştu." };
  }
}

async function allocateUnits(params: {
  customerId: string;
  productId: string;
  lotNumber: string;
  quantity: number;
  preferredSource?: "CLINIC" | "MAIN";
}): Promise<{ error?: string; items?: Array<{ id: string; locationId: string }> }> {
  const clinic = await prisma.location.findFirst({
    where: { customerId: params.customerId, type: "CLINIC_DEPOT" },
  });
  const main = await ensureMainDepot();

  const order: Array<{ id: string; source: "CLINIC" | "MAIN" }> = [];
  if (params.preferredSource === "MAIN") {
    order.push({ id: main.id, source: "MAIN" });
    if (clinic) order.push({ id: clinic.id, source: "CLINIC" });
  } else {
    if (clinic) order.push({ id: clinic.id, source: "CLINIC" });
    order.push({ id: main.id, source: "MAIN" });
  }

  // Tercih edilen kaynağa göre lot eşleşmesi: CLINIC lotları önce
  const selected: Array<{ id: string; locationId: string }> = [];
  let remaining = params.quantity;

  for (const loc of order) {
    if (remaining <= 0) break;
    if (params.preferredSource && loc.source !== params.preferredSource) {
      // preferredSource set ise yalnızca o kaynaktan dene ilk turda — aslında
      // lot scan already encodes source; we pass preferredSource from UI
    }
    if (params.preferredSource && loc.source !== params.preferredSource) continue;

    const items = await prisma.stockItem.findMany({
      where: {
        productId: params.productId,
        lotNumber: params.lotNumber,
        locationId: loc.id,
        isAvailable: true,
      },
      orderBy: { createdAt: "asc" },
      take: remaining,
      select: { id: true, locationId: true },
    });
    selected.push(...items);
    remaining -= items.length;
  }

  // preferredSource ile yetmediyse diğer kaynağa düş
  if (remaining > 0 && params.preferredSource) {
    for (const loc of order) {
      if (remaining <= 0) break;
      if (loc.source === params.preferredSource) continue;
      const items = await prisma.stockItem.findMany({
        where: {
          productId: params.productId,
          lotNumber: params.lotNumber,
          locationId: loc.id,
          isAvailable: true,
          id: { notIn: selected.map((s) => s.id) },
        },
        orderBy: { createdAt: "asc" },
        take: remaining,
        select: { id: true, locationId: true },
      });
      selected.push(...items);
      remaining -= items.length;
    }
  }

  if (remaining > 0) {
    return {
      error: `Yetersiz stok: ${params.lotNumber} lotundan ${params.quantity} adet bulunamadı.`,
    };
  }
  return { items: selected };
}

export async function createFailIntakeAction(input: {
  customerId: string;
  failCount: number;
  includeSpecs: boolean;
  specs?: Array<{
    diameter?: number | null;
    length?: number | null;
    lotNumber?: string | null;
  }>;
  givenLines: Array<{
    productId: string;
    lotNumber: string;
    quantity: number;
    source?: "CLINIC" | "MAIN";
  }>;
  /** Fail < verilen ise fazla ürün seçimi (adet toplamı = verilen − fail) */
  excessLines?: Array<{
    productId: string;
    lotNumber: string;
    quantity: number;
  }>;
  notes?: string;
}): Promise<{ error?: string; intakeId?: string; warning?: string }> {
  try {
    const gate = await requireFailAccess(true);
    if (gate.error || !gate.session) return { error: gate.error ?? "Oturum yok." };

    const customerId = input.customerId?.trim();
    if (!customerId) return { error: "Müşteri seçilmeli." };

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, assignedUserId: true, name: true },
    });
    if (!customer) return { error: "Müşteri bulunamadı." };
    if (
      !canAccessCustomerRecord(
        customer,
        gate.session.user.id,
        gate.session.user.roles as UserRole[],
      )
    ) {
      return { error: "Bu müşteri için işlem yetkiniz yok." };
    }

    const failCount = Math.floor(Number(input.failCount));
    if (!Number.isFinite(failCount) || failCount < 1) {
      return { error: "Alınan fail adedi en az 1 olmalı." };
    }

    const givenLines = (input.givenLines ?? []).filter((l) => l.quantity > 0);
    const givenTotal = givenLines.reduce((s, l) => s + l.quantity, 0);
    if (givenTotal < 1) {
      return { error: "Karşılığında en az bir ürün vermelisiniz." };
    }

    const excessNeeded = Math.max(0, givenTotal - failCount);
    const excessLines = input.excessLines ?? [];
    const excessTotal = excessLines.reduce((s, l) => s + l.quantity, 0);

    if (excessNeeded > 0) {
      if (excessTotal !== excessNeeded) {
        return {
          error:
            "Fazla ürün verdiniz. Hangi ürünün konsinye/müşteri deposuna ekleneceğini seçiniz.",
        };
      }
    }

    // Allocate all given units
    const allocated: Array<{
      id: string;
      locationId: string;
      productId: string;
      lotNumber: string;
    }> = [];

    for (const line of givenLines) {
      const result = await allocateUnits({
        customerId,
        productId: line.productId,
        lotNumber: line.lotNumber,
        quantity: line.quantity,
        preferredSource: line.source,
      });
      if (result.error || !result.items) return { error: result.error };
      for (const item of result.items) {
        allocated.push({
          id: item.id,
          locationId: item.locationId,
          productId: line.productId,
          lotNumber: line.lotNumber,
        });
      }
    }

    // Mark excess units
    const excessKeys = new Map<string, number>();
    for (const e of excessLines) {
      const key = `${e.productId}::${e.lotNumber}`;
      excessKeys.set(key, (excessKeys.get(key) ?? 0) + e.quantity);
    }

    const dispositions = new Map<string, "FAIL_HOLD" | "CONSIGNMENT_EXCESS">();
    for (const unit of allocated) {
      const key = `${unit.productId}::${unit.lotNumber}`;
      const remainingExcess = excessKeys.get(key) ?? 0;
      if (remainingExcess > 0) {
        dispositions.set(unit.id, "CONSIGNMENT_EXCESS");
        excessKeys.set(key, remainingExcess - 1);
      } else {
        dispositions.set(unit.id, "FAIL_HOLD");
      }
    }

    const creditQuantity = Math.max(0, failCount - givenTotal);
    const failHold = await ensureFailHoldDepot();
    const clinic = await prisma.location.findFirst({
      where: { customerId, type: "CLINIC_DEPOT" },
    });
    if (!clinic) return { error: "Müşteri konsinye deposu bulunamadı." };

    const cycle = await ensureOpenFailCycle();
    const userId = gate.session.user.id;

    const intakeId = await prisma.$transaction(async (tx) => {
      const intake = await tx.failIntake.create({
        data: {
          customerId,
          cycleId: cycle.id,
          createdById: userId,
          failCount,
          creditQuantity,
          notes: input.notes?.trim() || null,
          specs:
            input.includeSpecs && input.specs?.length
              ? {
                  create: input.specs.map((s) => ({
                    diameter:
                      s.diameter != null && Number.isFinite(s.diameter)
                        ? Number(s.diameter)
                        : null,
                    length:
                      s.length != null && Number.isFinite(s.length)
                        ? Number(s.length)
                        : null,
                    lotNumber: s.lotNumber?.trim() || null,
                  })),
                }
              : undefined,
        },
      });

      for (const unit of allocated) {
        const disposition = dispositions.get(unit.id) ?? "FAIL_HOLD";
        const toLocationId =
          disposition === "FAIL_HOLD" ? failHold.id : clinic.id;

        if (unit.locationId !== toLocationId) {
          await tx.stockItem.update({
            where: { id: unit.id },
            data: { locationId: toLocationId },
          });
          await tx.transferLog.create({
            data: {
              fromLocationId: unit.locationId,
              toLocationId,
              stockItemId: unit.id,
              executedById: userId,
              requestedById: userId,
            },
          });
        }

        await tx.failGivenItem.create({
          data: {
            intakeId: intake.id,
            stockItemId: unit.id,
            productId: unit.productId,
            disposition,
          },
        });
      }

      return intake.id;
    });

    revalidateFailPaths();
    let warning: string | undefined;
    if (creditQuantity > 0) {
      warning = `Eksik ürün teslim edildi. ${customer.name} için ${creditQuantity} adet alacak kaydedildi.`;
    }
    return { intakeId, warning };
  } catch (error) {
    console.error("[createFailIntakeAction]", error);
    return { error: "Fail alma kaydı oluşturulamadı." };
  }
}

export async function createFailShipmentAction(): Promise<{
  error?: string;
  shipmentId?: string;
}> {
  try {
    const gate = await requireFailAccess(true);
    if (gate.error || !gate.session) return { error: gate.error ?? "Oturum yok." };

    const cycle = await ensureOpenFailCycle();
    const failHold = await ensureFailHoldDepot();
    const pendingDepot = await ensureSupplierPendingDepot();

    const holdItems = await prisma.stockItem.findMany({
      where: {
        locationId: failHold.id,
        isAvailable: true,
        failGivenItems: {
          some: {
            disposition: "FAIL_HOLD",
            intake: { cycleId: cycle.id },
          },
        },
      },
      include: {
        product: { select: { id: true, referenceCode: true, name: true } },
      },
    });

    if (holdItems.length === 0) {
      return { error: "Gönderilecek fail ürünü yok." };
    }

    const lineMap = new Map<
      string,
      { productId: string; referenceCode: string; productName: string; quantity: number }
    >();
    for (const item of holdItems) {
      const prev = lineMap.get(item.productId);
      if (prev) prev.quantity += 1;
      else {
        lineMap.set(item.productId, {
          productId: item.productId,
          referenceCode: item.product.referenceCode,
          productName: item.product.name,
          quantity: 1,
        });
      }
    }

    const userId = gate.session.user.id;
    const shipmentId = await prisma.$transaction(async (tx) => {
      const shipment = await tx.failShipment.create({
        data: {
          cycleId: cycle.id,
          createdById: userId,
          lines: {
            create: Array.from(lineMap.values()),
          },
        },
      });

      await tx.stockItem.updateMany({
        where: { id: { in: holdItems.map((h) => h.id) } },
        data: { locationId: pendingDepot.id },
      });

      await tx.transferLog.createMany({
        data: holdItems.map((h) => ({
          fromLocationId: failHold.id,
          toLocationId: pendingDepot.id,
          stockItemId: h.id,
          executedById: userId,
          requestedById: userId,
        })),
      });

      await tx.failCycle.update({
        where: { id: cycle.id },
        data: { status: "CLOSED", closedAt: new Date() },
      });

      await tx.failCycle.create({ data: { status: "OPEN" } });

      return shipment.id;
    });

    revalidateFailPaths(`/dashboard/fail-yonetimi/gonderim/${shipmentId}`);
    return { shipmentId };
  } catch (error) {
    console.error("[createFailShipmentAction]", error);
    return { error: "Gönderme talebi oluşturulamadı." };
  }
}

export async function getFailShipmentPreviewAction(
  shipmentId: string,
): Promise<{ error?: string; shipment?: FailShipmentPreview }> {
  const gate = await requireFailAccess(false);
  if (gate.error) return { error: gate.error };

  const row = await prisma.failShipment.findUnique({
    where: { id: shipmentId },
    include: { lines: { orderBy: { referenceCode: "asc" } } },
  });
  if (!row) return { error: "Gönderim bulunamadı." };

  return {
    shipment: {
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      lines: row.lines.map((l) => ({
        referenceCode: l.referenceCode,
        productName: l.productName,
        quantity: l.quantity,
      })),
      totalQuantity: row.lines.reduce((s, l) => s + l.quantity, 0),
    },
  };
}

function countByProduct(lines: Array<{ productId: string; quantity: number }>) {
  const map = new Map<string, number>();
  for (const l of lines) {
    map.set(l.productId, (map.get(l.productId) ?? 0) + l.quantity);
  }
  return map;
}

export async function confirmSupplierReceiptAction(input: {
  lines: Array<{ productId: string; quantity: number; lotNumber?: string | null }>;
  swaps?: Array<{
    expectedProductId: string;
    receivedProductId: string;
    quantity: number;
  }>;
  /** Fazla gelen ürün → listedeki başka bekleyen ürün yerine */
  excessReplacements?: Array<{
    surplusProductId: string;
    replacedProductId: string;
    quantity: number;
  }>;
  confirmSwap?: boolean;
  confirmExcessSwap?: boolean;
}): Promise<{ error?: string; ok?: boolean; compare?: SupplierReceiptCompare }> {
  try {
    const gate = await requireFailAccess(true);
    if (gate.error || !gate.session) return { error: gate.error ?? "Oturum yok." };

    const received = (input.lines ?? []).filter((l) => l.quantity > 0);
    if (received.length === 0) return { error: "Gelen ürün listesi boş." };

    const pendingDepot = await ensureSupplierPendingDepot();
    const main = await ensureMainDepot();
    const pendingItems = await prisma.stockItem.findMany({
      where: { locationId: pendingDepot.id, isAvailable: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, productId: true, lotNumber: true },
    });

    if (pendingItems.length === 0) {
      return { error: "Bekleyen tedarikçi ürünü yok." };
    }

    const expectedMap = new Map<string, number>();
    for (const p of pendingItems) {
      expectedMap.set(p.productId, (expectedMap.get(p.productId) ?? 0) + 1);
    }
    const expected = Array.from(expectedMap.entries()).map(([productId, quantity]) => ({
      productId,
      quantity,
    }));

    const compare = compareSupplierReceipt(expected, received);
    if (compare.kind === "over") {
      return { error: compare.message, compare };
    }
    if (compare.kind === "swap" && !input.confirmSwap) {
      return { compare };
    }
    if (compare.kind === "excess_swap" && !input.confirmExcessSwap) {
      return { compare };
    }
    if (compare.kind === "swap") {
      const swaps = input.swaps ?? [];
      const swapTotal = swaps.reduce((s, x) => s + x.quantity, 0);
      const recTotal = received.reduce((s, x) => s + x.quantity, 0);
      if (swapTotal !== recTotal || swaps.length === 0) {
        return { error: "Takas eşleştirmesi tamamlanmalı." };
      }
    }
    if (compare.kind === "excess_swap") {
      const reps = (input.excessReplacements ?? []).filter((r) => r.quantity > 0);
      const surplusNeed = new Map(
        compare.surpluses.map((s) => [s.productId, s.quantity]),
      );
      const deficitMax = new Map(
        compare.replaceCandidates.map((s) => [s.productId, s.quantity]),
      );
      const surplusTotal = compare.surpluses.reduce((s, x) => s + x.quantity, 0);
      const deficitTotal = compare.replaceCandidates.reduce(
        (s, x) => s + x.quantity,
        0,
      );
      if (surplusTotal > deficitTotal) {
        return {
          error: `Fazla gelen ${surplusTotal} adedin yalnızca ${deficitTotal} adedi listedeki başka ürünlerle değiştirilebilir. Kalan ${surplusTotal - deficitTotal} adedi listeden düşürün.`,
          compare,
        };
      }
      const usedSurplus = new Map<string, number>();
      const usedReplace = new Map<string, number>();
      for (const r of reps) {
        if (!surplusNeed.has(r.surplusProductId)) {
          return { error: "Geçersiz fazla ürün seçimi.", compare };
        }
        if (!deficitMax.has(r.replacedProductId)) {
          return {
            error: "Değiştirilecek ürün, gelmeyen bekleyen ürünlerden olmalı.",
            compare,
          };
        }
        usedSurplus.set(
          r.surplusProductId,
          (usedSurplus.get(r.surplusProductId) ?? 0) + r.quantity,
        );
        usedReplace.set(
          r.replacedProductId,
          (usedReplace.get(r.replacedProductId) ?? 0) + r.quantity,
        );
      }
      for (const [id, need] of surplusNeed) {
        if ((usedSurplus.get(id) ?? 0) !== need) {
          return {
            error:
              "Fazla gelen her ürün için listedeki hangi ürünün yerine sayılacağını seçin.",
            compare,
          };
        }
      }
      for (const [id, qty] of usedReplace) {
        const max = deficitMax.get(id) ?? 0;
        if (qty > max) {
          return { error: "Seçilen değiştirilecek ürün adedi geçersiz.", compare };
        }
      }
    }

    const userId = gate.session.user.id;
    const latestShipment = await prisma.failShipment.findFirst({
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    const swapRecords =
      compare.kind === "swap" && input.swaps?.length
        ? input.swaps
        : compare.kind === "excess_swap" && input.excessReplacements?.length
          ? input.excessReplacements.map((r) => ({
              expectedProductId: r.replacedProductId,
              receivedProductId: r.surplusProductId,
              quantity: r.quantity,
            }))
          : [];

    await prisma.$transaction(async (tx) => {
      await tx.failSupplierReceipt.create({
        data: {
          shipmentId: latestShipment?.id ?? null,
          createdById: userId,
          lines: {
            create: received.map((l) => ({
              productId: l.productId,
              quantity: l.quantity,
              lotNumber: l.lotNumber?.trim() || null,
            })),
          },
          swaps: swapRecords.length
            ? {
                create: swapRecords.map((s) => ({
                  expectedProductId: s.expectedProductId,
                  receivedProductId: s.receivedProductId,
                  quantity: s.quantity,
                })),
              }
            : undefined,
        },
      });

      const lotByProduct = new Map<string, string>();
      for (const l of received) {
        if (l.lotNumber?.trim()) lotByProduct.set(l.productId, l.lotNumber.trim());
      }

      if (compare.kind === "exact") {
        const ids = pendingItems.map((p) => p.id);
        await tx.stockItem.updateMany({
          where: { id: { in: ids } },
          data: { locationId: main.id },
        });
        await tx.transferLog.createMany({
          data: ids.map((stockItemId) => ({
            fromLocationId: pendingDepot.id,
            toLocationId: main.id,
            stockItemId,
            executedById: userId,
            requestedById: userId,
          })),
        });
      } else if (compare.kind === "partial") {
        const remaining = new Map(countByProduct(received));
        const moveIds: string[] = [];
        for (const item of pendingItems) {
          const left = remaining.get(item.productId) ?? 0;
          if (left <= 0) continue;
          moveIds.push(item.id);
          remaining.set(item.productId, left - 1);
        }
        if (moveIds.length) {
          await tx.stockItem.updateMany({
            where: { id: { in: moveIds } },
            data: { locationId: main.id },
          });
          await tx.transferLog.createMany({
            data: moveIds.map((stockItemId) => ({
              fromLocationId: pendingDepot.id,
              toLocationId: main.id,
              stockItemId,
              executedById: userId,
              requestedById: userId,
            })),
          });
        }
      } else if (compare.kind === "swap") {
        const pendingIds = pendingItems.map((p) => p.id);
        await tx.stockItem.updateMany({
          where: { id: { in: pendingIds } },
          data: { isAvailable: false },
        });
        for (const l of received) {
          const lot =
            lotByProduct.get(l.productId) ??
            `FAIL-SWAP-${new Date().toISOString().slice(0, 10)}`;
          await tx.stockItem.createMany({
            data: Array.from({ length: l.quantity }, () => ({
              productId: l.productId,
              lotNumber: lot,
              locationId: main.id,
              isAvailable: true,
            })),
          });
        }
      } else if (compare.kind === "excess_swap") {
        const recMap = countByProduct(received);
        const matched = new Map<string, number>();
        for (const [id, rQty] of recMap) {
          matched.set(id, Math.min(rQty, expectedMap.get(id) ?? 0));
        }

        const usedPending = new Set<string>();
        const moveIds: string[] = [];
        const matchLeft = new Map(matched);
        for (const item of pendingItems) {
          const left = matchLeft.get(item.productId) ?? 0;
          if (left <= 0) continue;
          moveIds.push(item.id);
          usedPending.add(item.id);
          matchLeft.set(item.productId, left - 1);
        }

        if (moveIds.length) {
          await tx.stockItem.updateMany({
            where: { id: { in: moveIds } },
            data: { locationId: main.id },
          });
          await tx.transferLog.createMany({
            data: moveIds.map((stockItemId) => ({
              fromLocationId: pendingDepot.id,
              toLocationId: main.id,
              stockItemId,
              executedById: userId,
              requestedById: userId,
            })),
          });
        }

        const replaceLeft = new Map<string, number>();
        for (const r of input.excessReplacements ?? []) {
          replaceLeft.set(
            r.replacedProductId,
            (replaceLeft.get(r.replacedProductId) ?? 0) + r.quantity,
          );
        }
        const removeIds: string[] = [];
        for (const item of pendingItems) {
          if (usedPending.has(item.id)) continue;
          const left = replaceLeft.get(item.productId) ?? 0;
          if (left <= 0) continue;
          removeIds.push(item.id);
          usedPending.add(item.id);
          replaceLeft.set(item.productId, left - 1);
        }
        if (removeIds.length) {
          await tx.stockItem.updateMany({
            where: { id: { in: removeIds } },
            data: { isAvailable: false },
          });
        }

        for (const r of input.excessReplacements ?? []) {
          if (r.quantity <= 0) continue;
          const lot =
            lotByProduct.get(r.surplusProductId) ??
            `FAIL-EXCESS-${new Date().toISOString().slice(0, 10)}`;
          await tx.stockItem.createMany({
            data: Array.from({ length: r.quantity }, () => ({
              productId: r.surplusProductId,
              lotNumber: lot,
              locationId: main.id,
              isAvailable: true,
            })),
          });
        }
      }
    });

    revalidateFailPaths();
    return { ok: true, compare };
  } catch (error) {
    console.error("[confirmSupplierReceiptAction]", error);
    return { error: "Tedarikçi teslimi kaydedilemedi." };
  }
}

/** Katalog arama — fail verilen ürün manuel ekleme */
export async function searchFailGiveCatalogAction(query: string): Promise<
  Array<{
    id: string;
    referenceCode: string;
    name: string;
    brand: string;
    barcode: string | null;
  }>
> {
  const gate = await requireFailAccess(false);
  if (gate.error) return [];
  const q = query.trim();
  if (q.length < 2) return [];
  return prisma.product.findMany({
    where: {
      isActive: true,
      OR: [
        { referenceCode: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
        { barcode: { contains: q, mode: "insensitive" } },
        { brand: { contains: q, mode: "insensitive" } },
      ],
    },
    take: 20,
    select: {
      id: true,
      referenceCode: true,
      name: true,
      brand: true,
      barcode: true,
    },
    orderBy: { referenceCode: "asc" },
  });
}
