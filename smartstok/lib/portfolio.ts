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

/** Klinik depo listesi: ana depo herkese; klinik depolar portföye göre; gizli sistem depoları hariç */
export function locationPortfolioWhere(
  userId: string | undefined,
  roles: readonly UserRole[] | null | undefined,
): Prisma.LocationWhereInput {
  const visibleTypes: Prisma.LocationWhereInput = {
    type: { in: ["MAIN_DEPOT", "CLINIC_DEPOT"] },
  };

  if (canSeeAllCustomers(roles)) {
    return visibleTypes;
  }
  if (isPortfolioScopedSales(roles) && userId) {
    return {
      AND: [
        visibleTypes,
        {
          OR: [
            { type: "MAIN_DEPOT" },
            { customer: { assignedUserId: userId } },
          ],
        },
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
