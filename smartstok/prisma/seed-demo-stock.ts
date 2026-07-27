/**
 * Demo stok seed — transfer testleri için merkez depo + ürün + lot.
 * Çalıştır: npx tsx prisma/seed-demo-stock.ts
 */
import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

async function main() {
  const mainDepot =
    (await prisma.location.findFirst({ where: { type: "MAIN_DEPOT" } })) ??
    (await prisma.location.create({
      data: { name: "Merkez Depo", type: "MAIN_DEPOT" },
    }));

  const products = [
    {
      referenceCode: "3510",
      brand: "BRN",
      category: "İmplant",
      name: "Ürün",
      diameter: 3.5,
      length: 10,
      purchasePrice: 800,
      salePrice: 1200,
      barcode: "8690000003510",
      lots: [
        { lot: "LOT-A1", qty: 20 },
        { lot: "LOT-A2", qty: 30 },
      ],
    },
    {
      referenceCode: "4212",
      brand: "BRN",
      category: "Abutment",
      name: "Abutment",
      diameter: 4.2,
      length: 12,
      purchasePrice: 400,
      salePrice: 650,
      barcode: "8690000004212",
      lots: [{ lot: "LOT-B1", qty: 15 }],
    },
  ];

  for (const p of products) {
    const product = await prisma.product.upsert({
      where: { referenceCode: p.referenceCode },
      update: {
        name: p.name,
        brand: p.brand,
        diameter: p.diameter,
        length: p.length,
        barcode: p.barcode,
      },
      create: {
        referenceCode: p.referenceCode,
        brand: p.brand,
        category: p.category,
        name: p.name,
        diameter: p.diameter,
        length: p.length,
        purchasePrice: p.purchasePrice,
        salePrice: p.salePrice,
        barcode: p.barcode,
      },
    });

    for (const { lot, qty } of p.lots) {
      const existing = await prisma.stockItem.count({
        where: {
          productId: product.id,
          lotNumber: lot,
          locationId: mainDepot.id,
        },
      });

      const toCreate = Math.max(0, qty - existing);
      if (toCreate === 0) continue;

      await prisma.stockItem.createMany({
        data: Array.from({ length: toCreate }, () => ({
          productId: product.id,
          lotNumber: lot,
          locationId: mainDepot.id,
          isAvailable: true,
        })),
      });
    }
  }

  console.log("Demo stok hazır. Merkez depo:", mainDepot.name);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
