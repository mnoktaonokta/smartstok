import { auth } from "@/auth";
import {
  getProductBrandsAction,
  listProductsAction,
} from "@/lib/actions/catalog";
import {
  canMutateData,
  canSeePurchasePrice,
  canSeeSalePrice,
} from "@/lib/roles";
import { ProductsTable } from "@/components/products/products-table";

export default async function ProductsPage() {
  const session = await auth();
  const roles = session?.user?.roles ?? [];
  const [products, brands] = await Promise.all([
    listProductsAction(),
    getProductBrandsAction(),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <p className="font-mono text-xs tracking-[0.25em] text-blue-400 uppercase">
          Katalog
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Ürünler</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Ürün tanımları, kategori/marka filtreleri ve stok özeti.
        </p>
      </div>

      <ProductsTable
        products={products}
        brands={brands}
        showPurchasePrice={canSeePurchasePrice(roles)}
        showSalePrice={canSeeSalePrice(roles)}
        canMutate={canMutateData(roles)}
      />
    </div>
  );
}
