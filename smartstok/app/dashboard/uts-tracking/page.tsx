import { auth } from "@/auth";
import { listUtsPendingGroupsAction } from "@/lib/actions/uts";
import { canMutateData } from "@/lib/roles";
import { UtsPendingGroups } from "@/components/uts/uts-pending-groups";
import { UtsInventoryQueryButton } from "@/components/uts/uts-inventory-query";

export default async function UtsTrackingPage() {
  const session = await auth();
  const canMutate = canMutateData(session?.user?.roles);
  const groups = await listUtsPendingGroupsAction();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-mono text-xs tracking-[0.25em] text-blue-400 uppercase">
            ÜTS
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-white">
            ÜTS Bildirim Bekleyenler
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-zinc-400">
            Aşağıdaki ürünler faturalandırılmış olup, Sağlık Bakanlığı ÜTS
            portalı üzerinden tüketim/çıkış bildirimlerinin yapılması
            beklenmektedir. İşlemleri klinik/depo bazında yönetin.
          </p>
        </div>
        <UtsInventoryQueryButton />
      </div>

      <UtsPendingGroups initialGroups={groups} canMutate={canMutate} />
    </div>
  );
}
