import type { UserRole } from "@/types/next-auth";

/** Personel yetkileri (Admin ayrı / birlikte de verilebilir) */
export const STAFF_ROLE_OPTIONS = [
  { value: "SAHA" as const, label: "Saha Satış" },
  { value: "DEPO" as const, label: "Depo" },
  { value: "MUHASEBE" as const, label: "Muhasebe" },
  { value: "OBSERVER" as const, label: "Gözlemci" },
];

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "Admin",
  SAHA: "Saha Satış",
  DEPO: "Depo",
  MUHASEBE: "Muhasebe",
  OBSERVER: "Gözlemci",
};

export const OBSERVER_MUTATION_ERROR =
  "Gözlemci yetkisi ile değişiklik yapılamaz";

/** Sidebar / erişim sırası (yetkisi olan ilk sayfa = ana sayfa) */
export const NAV_PATH_ORDER = [
  "/dashboard",
  "/dashboard/admin",
  "/dashboard/products",
  "/dashboard/customers",
  "/dashboard/depots",
  "/dashboard/transfers",
  "/dashboard/fail-yonetimi",
  "/dashboard/e-belge-fatura",
  "/dashboard/invoices",
  "/dashboard/malkabul",
  "/dashboard/sayim",
  "/dashboard/uts-tracking",
] as const;

/**
 * Rol → sayfa erişimi.
 * ADMIN tüm /dashboard yollarına erişir.
 * OBSERVER: admin paneli hariç tüm sayfalar.
 */
const ROLE_PAGE_PREFIXES: Record<Exclude<UserRole, "ADMIN">, string[]> = {
  MUHASEBE: [
    "/dashboard", // yalnızca özet (tam eşleşme ayrı kontrol)
    "/dashboard/customers",
    "/dashboard/e-belge-fatura",
    "/dashboard/invoices",
    "/dashboard/uts-tracking",
    "/dashboard/products",
  ],
  SAHA: [
    "/dashboard",
    "/dashboard/customers",
    "/dashboard/transfers",
    "/dashboard/depots",
    "/dashboard/products",
    "/dashboard/fail-yonetimi",
  ],
  DEPO: [
    "/dashboard",
    "/dashboard/malkabul",
    "/dashboard/sayim",
    "/dashboard/fail-yonetimi",
    "/dashboard/transfers",
    "/dashboard/products",
    "/dashboard/depots",
  ],
  OBSERVER: [
    "/dashboard",
    "/dashboard/products",
    "/dashboard/sayim",
    "/dashboard/fail-yonetimi",
    "/dashboard/depots",
    "/dashboard/customers",
    "/dashboard/e-belge-fatura",
    "/dashboard/invoices",
    "/dashboard/uts-tracking",
  ],
};

export function hasRole(
  roles: readonly UserRole[] | string | null | undefined,
  role: UserRole,
): boolean {
  if (!roles) return false;
  if (typeof roles === "string") return roles === role;
  return roles.includes(role);
}

export function hasAnyRole(
  roles: readonly UserRole[] | null | undefined,
  needed: readonly UserRole[],
): boolean {
  return needed.some((r) => hasRole(roles, r));
}

export function formatRoles(roles: readonly UserRole[]): string {
  if (!roles.length) return "—";
  return roles.map((r) => ROLE_LABELS[r] ?? r).join(", ");
}

export function normalizeRoles(roles: readonly string[]): UserRole[] {
  const allowed: UserRole[] = [
    "ADMIN",
    "MUHASEBE",
    "DEPO",
    "SAHA",
    "OBSERVER",
  ];
  const set = new Set<UserRole>();
  for (const r of roles) {
    if (allowed.includes(r as UserRole)) set.add(r as UserRole);
  }
  return allowed.filter((r) => set.has(r));
}

/**
 * Yalnızca Gözlemci (operasyonel rol yok) — salt okunur UI/backend.
 */
export function isReadOnlyObserver(
  roles: readonly UserRole[] | null | undefined,
): boolean {
  if (!roles?.length) return false;
  return (
    hasRole(roles, "OBSERVER") &&
    !hasAnyRole(roles, ["ADMIN", "MUHASEBE", "DEPO", "SAHA"])
  );
}

/** Create / update / delete işlemleri yapılabilir mi */
export function canMutateData(
  roles: readonly UserRole[] | null | undefined,
): boolean {
  return !isReadOnlyObserver(roles);
}

/**
 * Tüm müşteri portföyünü görebilir mi?
 * Admin / Depo / Muhasebe / Gözlemci → evet.
 * Yalnızca Saha (veya Saha + Admin dışı yüksüz) → hayır, kendi atamaları.
 */
export function canSeeAllCustomers(
  roles: readonly UserRole[] | null | undefined,
): boolean {
  return hasAnyRole(roles, ["ADMIN", "DEPO", "MUHASEBE", "OBSERVER"]);
}

/** Portföyü kendi müşterileriyle sınırlı Saha personeli */
export function isPortfolioScopedSales(
  roles: readonly UserRole[] | null | undefined,
): boolean {
  return hasRole(roles, "SAHA") && !canSeeAllCustomers(roles);
}

/** Fail Yönetimi — Admin, Depo, Saha (Gözlemci salt okunur erişim path’te) */
export function canAccessFailManagement(
  roles: readonly UserRole[] | null | undefined,
): boolean {
  return hasAnyRole(roles, ["ADMIN", "DEPO", "SAHA", "OBSERVER"]);
}

/** Mal Kabul — yalnızca Admin ve Depo */
export function canAccessInboundReceipt(
  roles: readonly UserRole[] | null | undefined,
): boolean {
  return hasRole(roles, "ADMIN") || hasRole(roles, "DEPO");
}

/** Yazma işlemlerinde çağırın; Gözlemci için throw eder */
export function assertCanMutate(
  roles: readonly UserRole[] | null | undefined,
): void {
  if (isReadOnlyObserver(roles)) {
    throw new Error(OBSERVER_MUTATION_ERROR);
  }
}

export function mutationDeniedMessage(error: unknown): string | null {
  if (
    error instanceof Error &&
    error.message === OBSERVER_MUTATION_ERROR
  ) {
    return error.message;
  }
  return null;
}

/** Alış / maliyet — Admin ve Gözlemci */
export function canSeePurchasePrice(
  roles: readonly UserRole[] | null | undefined,
): boolean {
  return hasRole(roles, "ADMIN") || hasRole(roles, "OBSERVER");
}

/** Satış fiyatı — Admin, Muhasebe, Saha, Gözlemci (Depo göremez) */
export function canSeeSalePrice(
  roles: readonly UserRole[] | null | undefined,
): boolean {
  return (
    hasRole(roles, "ADMIN") ||
    hasRole(roles, "MUHASEBE") ||
    hasRole(roles, "SAHA") ||
    hasRole(roles, "OBSERVER")
  );
}

/** Dashboard ciro / alacak kartları ve satış grafikleri */
export function canSeeDashboardFinance(
  roles: readonly UserRole[] | null | undefined,
): boolean {
  return (
    hasRole(roles, "ADMIN") ||
    hasRole(roles, "MUHASEBE") ||
    hasRole(roles, "OBSERVER")
  );
}

function pathAllowedByPrefix(pathname: string, prefix: string): boolean {
  if (prefix === "/dashboard") {
    return pathname === "/dashboard" || pathname === "/dashboard/";
  }
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** Kullanıcının görebileceği sayfa prefix listesi (birleşik) */
export function getAllowedPathPrefixes(
  roles: readonly UserRole[] | null | undefined,
): string[] {
  if (hasRole(roles, "ADMIN")) {
    return [...NAV_PATH_ORDER];
  }

  const set = new Set<string>();
  for (const role of roles ?? []) {
    if (role === "ADMIN") continue;
    for (const p of ROLE_PAGE_PREFIXES[role] ?? []) {
      set.add(p);
    }
  }
  return NAV_PATH_ORDER.filter((p) => set.has(p));
}

export function canAccessPath(
  roles: readonly UserRole[] | null | undefined,
  pathname: string,
): boolean {
  if (!pathname.startsWith("/dashboard")) return true;
  if (pathname.startsWith("/dashboard/unauthorized")) return true;
  if (hasRole(roles, "ADMIN")) return true;

  const allowed = getAllowedPathPrefixes(roles);
  return allowed.some((p) => pathAllowedByPrefix(pathname, p));
}

/**
 * Dashboard görünümü seçimi.
 * Admin/Muhasebe/Gözlemci → finansal özet; Saha → satış; Depo → depo.
 */
export type DashboardVariant = "admin" | "sales" | "warehouse";

export function getDashboardVariant(
  roles: readonly UserRole[] | null | undefined,
): DashboardVariant {
  if (
    hasRole(roles, "ADMIN") ||
    hasRole(roles, "MUHASEBE") ||
    hasRole(roles, "OBSERVER")
  ) {
    return "admin";
  }
  if (hasRole(roles, "SAHA")) {
    return "sales";
  }
  if (hasRole(roles, "DEPO")) {
    return "warehouse";
  }
  return "admin";
}

/** Giriş sonrası herkes /dashboard'a düşer */
export function getHomePath(
  _roles?: readonly UserRole[] | null,
): string {
  return "/dashboard";
}
