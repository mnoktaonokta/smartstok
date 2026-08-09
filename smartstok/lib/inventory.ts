import { prisma } from "@/lib/prisma";

/** Merkez depoyu bulur; yoksa oluşturur. */
export async function ensureMainDepot() {
  const existing = await prisma.location.findFirst({
    where: { type: "MAIN_DEPOT" },
  });

  if (existing) return existing;

  return prisma.location.create({
    data: {
      name: "Merkez Depo",
      type: "MAIN_DEPOT",
    },
  });
}

/** Fail Listesi gizli deposu */
export async function ensureFailHoldDepot() {
  const existing = await prisma.location.findFirst({
    where: { type: "FAIL_HOLD" },
  });
  if (existing) return existing;
  return prisma.location.create({
    data: {
      name: "Fail Listesi",
      type: "FAIL_HOLD",
    },
  });
}

/** Tedarikçi bekleme gizli deposu */
export async function ensureSupplierPendingDepot() {
  const existing = await prisma.location.findFirst({
    where: { type: "SUPPLIER_PENDING" },
  });
  if (existing) return existing;
  return prisma.location.create({
    data: {
      name: "Tedarikçi Bekleme Deposu",
      type: "SUPPLIER_PENDING",
    },
  });
}

/** Açık fail döngüsü; yoksa oluşturur */
export async function ensureOpenFailCycle() {
  const open = await prisma.failCycle.findFirst({
    where: { status: "OPEN" },
    orderBy: { createdAt: "desc" },
  });
  if (open) return open;
  return prisma.failCycle.create({
    data: { status: "OPEN" },
  });
}

/** UI’da gösterilen depo tipleri (gizli sistem depoları hariç) */
export const VISIBLE_LOCATION_TYPES = ["MAIN_DEPOT", "CLINIC_DEPOT"] as const;

export { formatProductSize, formatProductLabel } from "@/lib/product-format";
