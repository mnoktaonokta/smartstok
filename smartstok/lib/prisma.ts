import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/** pg v8 SSL uyarılarını önlemek için bağlantı dizesini normalize eder. */
function normalizeDatabaseUrl(url: string) {
  try {
    const parsed = new URL(url);

    if (!parsed.searchParams.has("uselibpqcompat")) {
      parsed.searchParams.set("uselibpqcompat", "true");
    }

    // Neon için require + libpq uyumu yeterli
    if (
      parsed.searchParams.get("sslmode") === "require" ||
      parsed.searchParams.get("sslmode") === "prefer" ||
      parsed.searchParams.get("sslmode") === "verify-ca"
    ) {
      parsed.searchParams.set("sslmode", "require");
    }

    return parsed.toString();
  } catch {
    return url;
  }
}

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL ortam değişkeni tanımlı değil.");
  }

  const adapter = new PrismaPg(normalizeDatabaseUrl(connectionString));
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
