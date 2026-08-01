/**
 * Go-live öncesi operasyonel veri sıfırlama (Hard Reset).
 *
 * Siler: transferler, faturalar, stoklar, ürünler, müşteriler, konsinye depolar,
 *        ziyaretler, görevler, mal kabul kayıtları
 * Korur: User (tüm hesaplar) + MAIN_DEPOT (Merkez Depo)
 *
 * Çalıştırma (smartstok/ klasöründen):
 *   CONFIRM_RESET=YES npx tsx scripts/reset-db.ts
 *
 * veya:
 *   CONFIRM_RESET=YES npm run db:reset-ops
 */
import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

function normalizeDatabaseUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has("uselibpqcompat")) {
      parsed.searchParams.set("uselibpqcompat", "true");
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL tanımlı değil. .env dosyasını kontrol edin.");
  }
  return new PrismaClient({
    adapter: new PrismaPg(normalizeDatabaseUrl(url)),
  });
}

async function resetOperationalData() {
  if (process.env.CONFIRM_RESET !== "YES") {
    console.error(`
⛔ Güvenlik: Bu script veritabanındaki TÜM operasyonel veriyi siler (User hariç).

Çalıştırmak için:
  CONFIRM_RESET=YES npx tsx scripts/reset-db.ts

veya:
  CONFIRM_RESET=YES npm run db:reset-ops
`);
    process.exit(1);
  }

  const prisma = createClient();

  console.log("🧹 Operasyonel veri sıfırlama başlıyor…");
  console.log("⚠️  User tablosuna DOKUNULMAYACAK.\n");

  try {
    // Neon / pooler üzerinde uzun $transaction zaman aşımına düşmesin diye
    // silmeler sırayla (sequential) çalıştırılır — FK sırası korunur.

    console.log("→ InvoiceItem siliniyor…");
    const invoiceItems = await prisma.invoiceItem.deleteMany({});

    console.log("→ TransferLog siliniyor…");
    const transfers = await prisma.transferLog.deleteMany({});

    console.log("→ StockItem siliniyor…");
    const stockItems = await prisma.stockItem.deleteMany({});

    console.log("→ Invoice siliniyor…");
    const invoices = await prisma.invoice.deleteMany({});

    console.log("→ Visit siliniyor…");
    const visits = await prisma.visit.deleteMany({});

    console.log("→ Task siliniyor…");
    const tasks = await prisma.task.deleteMany({});

    console.log("→ InboundReceipt siliniyor…");
    const inbound = await prisma.inboundReceipt.deleteMany({});

    console.log("→ InventoryCountItem / InventoryCount siliniyor…");
    const countItems = await prisma.inventoryCountItem.deleteMany({});
    const counts = await prisma.inventoryCount.deleteMany({});

    console.log("→ Product siliniyor…");
    const products = await prisma.product.deleteMany({});

    console.log("→ Klinik / konsinye depolar siliniyor…");
    const clinicDepots = await prisma.location.deleteMany({
      where: { type: { not: "MAIN_DEPOT" } },
    });

    console.log("→ Customer siliniyor…");
    const customers = await prisma.customer.deleteMany({});

    let mainDepot = await prisma.location.findFirst({
      where: { type: "MAIN_DEPOT" },
      orderBy: { createdAt: "asc" },
    });

    let mainDepotCreated = false;
    if (!mainDepot) {
      console.log("→ Merkez Depo yok, oluşturuluyor…");
      mainDepot = await prisma.location.create({
        data: { name: "Merkez Depo", type: "MAIN_DEPOT" },
      });
      mainDepotCreated = true;
    }

    const usersKept = await prisma.user.count();

    console.log("\n✅ Sıfırlama tamamlandı.\n");
    console.log("Silinen kayıtlar:");
    console.log(`  InvoiceItem      : ${invoiceItems.count}`);
    console.log(`  TransferLog      : ${transfers.count}`);
    console.log(`  StockItem        : ${stockItems.count}`);
    console.log(`  Invoice          : ${invoices.count}`);
    console.log(`  Visit            : ${visits.count}`);
    console.log(`  Task             : ${tasks.count}`);
    console.log(`  InboundReceipt   : ${inbound.count}`);
    console.log(`  InventoryCountItem: ${countItems.count}`);
    console.log(`  InventoryCount   : ${counts.count}`);
    console.log(`  Product          : ${products.count}`);
    console.log(`  Location (klinik): ${clinicDepots.count}`);
    console.log(`  Customer         : ${customers.count}`);
    console.log("");
    console.log(
      mainDepotCreated
        ? `📦 Merkez Depo oluşturuldu: ${mainDepot.name} (${mainDepot.id})`
        : `📦 Merkez Depo korundu: ${mainDepot.name} (${mainDepot.id})`,
    );
    console.log(`👤 Korunan kullanıcı sayısı: ${usersKept}`);
  } finally {
    await prisma.$disconnect();
  }
}

resetOperationalData().catch((error) => {
  console.error("❌ Sıfırlama başarısız:", error);
  process.exit(1);
});
