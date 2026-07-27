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

export { formatProductSize, formatProductLabel } from "@/lib/product-format";
