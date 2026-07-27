import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = "muratocak@brndental.com".toLowerCase();
  const hashedPassword = await hash("123456", 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      hashedPassword,
      fullName: "Murat Ocak",
      role: "ADMIN",
      isActive: true,
    },
    create: {
      email,
      hashedPassword,
      fullName: "Murat Ocak",
      role: "ADMIN",
      isActive: true,
      forcePasswordChange: true,
    },
  });

  console.log(`Admin kullanıcı hazır: ${user.email} (${user.role})`);
}

main()
  .catch((error) => {
    console.error("Seed hatası:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
