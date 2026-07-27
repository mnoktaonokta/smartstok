import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ensureMainDepot } from "@/lib/inventory";
import { listInboundReceiptsAction } from "@/lib/actions/inbound";
import {
  canAccessInboundReceipt,
  hasRole,
} from "@/lib/roles";
import { InboundReceiptWorkspace } from "@/components/stock/inbound-receipt-workspace";
import { InboundReceiptsList } from "@/components/stock/inbound-receipts-list";

export default async function MalKabulPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  if (!canAccessInboundReceipt(session.user.roles)) {
    redirect("/dashboard/unauthorized");
  }

  const mainDepot = await ensureMainDepot();
  const receipts = await listInboundReceiptsAction();
  const isAdmin = hasRole(session.user.roles, "ADMIN");

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <p className="font-mono text-xs tracking-[0.25em] text-blue-400 uppercase">
          Depo
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-white">
          Akıllı Mal Kabul
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          Fatura OCR (AI) veya manuel barkod ile ana depoya giriş; uyumsuzluk
          takibi.
        </p>
      </div>

      <InboundReceiptWorkspace mainDepotName={mainDepot.name} />

      <section className="space-y-3">
        <h2 className="text-lg font-medium text-white">Son Mal Kabul Kayıtları</h2>
        <p className="text-xs text-zinc-500">
          Uyumsuzluk (DISCREPANCY) kayıtlarının açıklamasını inceleyin.
          {isAdmin
            ? " Admin, sorun çözüldüğünde kaydı COMPLETED olarak işaretleyebilir."
            : ""}
        </p>
        <InboundReceiptsList receipts={receipts} isAdmin={isAdmin} />
      </section>
    </div>
  );
}
