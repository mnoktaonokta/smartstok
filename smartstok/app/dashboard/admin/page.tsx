import { redirect } from "next/navigation";
import { Shield } from "lucide-react";
import { auth } from "@/auth";
import { listUsersAction, getCategoryStockBreakdownAction } from "@/lib/actions/admin";
import { formatRoles, hasRole } from "@/lib/roles";
import { AdminCreateUserForm } from "@/components/admin/admin-create-user-form";
import { AdminUserRowActions } from "@/components/admin/admin-user-row-actions";
import { AdminSyncCustomersButton } from "@/components/admin/admin-sync-customers-button";
import { AdminCategoryStockCard } from "@/components/admin/admin-category-stock-card";
import { AdminProductImport } from "@/components/admin/admin-product-import";
import { AdminStockCountModal } from "@/components/admin/admin-stock-count-modal";
import { AdminExportStocksButton } from "@/components/admin/admin-export-stocks-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function AdminPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!hasRole(session.user.roles, "ADMIN")) {
    redirect("/dashboard");
  }

  const [users, categoryStock] = await Promise.all([
    listUsersAction(),
    getCategoryStockBreakdownAction(),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-xs tracking-[0.25em] text-blue-400 uppercase">
            Yönetim
          </p>
          <h1 className="mt-2 flex items-center gap-2 text-3xl font-semibold text-white">
            <Shield className="size-7 text-blue-400" />
            Admin Kontrol Paneli
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Kullanıcı, müşteri senkronu, toplu ürün aktarımı ve barkod sayım.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <AdminExportStocksButton />
          <AdminStockCountModal />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-zinc-200">Kullanıcı Yönetimi</CardTitle>
            <CardDescription>
              Yeni personel ekleyin. Saha Satış, Depo, Muhasebe ve Gözlemci
              yetkilerini birlikte verebilirsiniz.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <AdminCreateUserForm />
            <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ad</TableHead>
                    <TableHead>E-posta</TableHead>
                    <TableHead>Yetkiler</TableHead>
                    <TableHead className="text-right">İşlemler</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="text-zinc-200">{u.fullName}</TableCell>
                      <TableCell className="font-mono text-xs text-blue-300">
                        {u.email}
                      </TableCell>
                      <TableCell className="text-xs text-zinc-400">
                        {formatRoles(u.roles)}
                      </TableCell>
                      <TableCell className="text-right">
                        <AdminUserRowActions
                          currentUserId={session.user.id}
                          user={{
                            id: u.id,
                            email: u.email,
                            fullName: u.fullName,
                            roles: u.roles,
                            isActive: u.isActive,
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-zinc-200">Müşteri Senkronu</CardTitle>
            <CardDescription>
              Bizim Hesap’taki carileri SmartStok’a aktarın / güncelleyin.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <AdminSyncCustomersButton />
            <div className="border-t border-zinc-800 pt-5">
              <AdminCategoryStockCard data={categoryStock} />
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-zinc-200">Toplu Ürün Yönetimi</CardTitle>
            <CardDescription>
              Excel veya CSV ile ürün kataloğu ve stok miktarı yükleyin.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AdminProductImport />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
