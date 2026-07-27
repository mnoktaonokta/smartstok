import type { Prisma } from "@/app/generated/prisma/client";
import type { UserRole } from "@/types/next-auth";
import { canSeeAllCustomers, isPortfolioScopedSales } from "@/lib/roles";

/** Müşteri listesi / sayım için where filtresi */
export function customerPortfolioWhere(
  userId: string | undefined,
  roles: readonly UserRole[] | null | undefined,
): Prisma.CustomerWhereInput {
  if (canSeeAllCustomers(roles)) {
    return {};
  }
  if (isPortfolioScopedSales(roles) && userId) {
    return { assignedUserId: userId };
  }
  // Yetkisiz / tanımsız
  return { id: "__none__" };
}

/** Klinik depo listesi: ana depo herkese; klinik depolar portföye göre */
export function locationPortfolioWhere(
  userId: string | undefined,
  roles: readonly UserRole[] | null | undefined,
): Prisma.LocationWhereInput {
  if (canSeeAllCustomers(roles)) {
    return {};
  }
  if (isPortfolioScopedSales(roles) && userId) {
    return {
      OR: [
        { type: "MAIN_DEPOT" },
        { customer: { assignedUserId: userId } },
      ],
    };
  }
  return { type: "MAIN_DEPOT" };
}

export function canAccessCustomerRecord(
  customer: { assignedUserId: string | null },
  userId: string | undefined,
  roles: readonly UserRole[] | null | undefined,
): boolean {
  if (canSeeAllCustomers(roles)) return true;
  if (isPortfolioScopedSales(roles) && userId) {
    return customer.assignedUserId === userId;
  }
  return false;
}
