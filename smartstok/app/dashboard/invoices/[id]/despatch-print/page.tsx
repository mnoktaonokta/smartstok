import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canAccessPath } from "@/lib/roles";
import type { UserRole } from "@/types/next-auth";
import { DespatchPrintView } from "@/components/invoices/despatch-print-view";

export default async function DespatchPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (
    !canAccessPath(
      session.user.roles as UserRole[],
      "/dashboard/invoices",
    )
  ) {
    redirect("/dashboard/unauthorized");
  }

  const { id } = await params;
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    omit: { pdfData: true, despatchPdfData: true },
    include: {
      customer: true,
      items: {
        include: {
          stockItem: {
            include: {
              product: { select: { referenceCode: true, name: true } },
            },
          },
        },
      },
    },
  });
  if (!invoice?.despatchUuid) notFound();

  const settings = await prisma.companySettings.findUnique({
    where: { id: 1 },
  });

  const lineMap = new Map<
    string,
    { productName: string; lotNumber: string; quantity: number }
  >();
  for (const item of invoice.items) {
    const p = item.stockItem.product;
    const lot = item.stockItem.lotNumber;
    const key = `${p.referenceCode}::${lot}`;
    const existing = lineMap.get(key);
    if (existing) existing.quantity += 1;
    else {
      lineMap.set(key, {
        productName: `${p.referenceCode} ${p.name}`,
        lotNumber: lot,
        quantity: 1,
      });
    }
  }

  return (
    <DespatchPrintView
      despatchNumber={invoice.despatchNo || invoice.invoiceNo || invoice.id}
      uuid={invoice.despatchUuid}
      issueDate={
        invoice.despatchedAt?.toISOString() ?? invoice.createdAt.toISOString()
      }
      companyName={settings?.companyName ?? "—"}
      companyVkn={(settings?.qnbVkn || settings?.vkn || "").trim()}
      companyAddress={settings?.address ?? ""}
      customerName={invoice.customer?.name ?? "—"}
      customerVkn={invoice.customer?.vknTckn ?? "—"}
      customerAddress={invoice.customer?.address ?? ""}
      note={invoice.note}
      lines={Array.from(lineMap.values())}
    />
  );
}
