import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canAccessPath } from "@/lib/roles";
import { renderDespatchPdfForInvoice } from "@/lib/services/edocument/load-despatch-print";
import type { UserRole } from "@/types/next-auth";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (
    !canAccessPath(
      session.user.roles as UserRole[],
      "/dashboard/invoices",
    )
  ) {
    return new Response("Forbidden", { status: 403 });
  }

  const { id } = await ctx.params;
  const pdf = await renderDespatchPdfForInvoice(id);
  if (!pdf) {
    return new Response("e-İrsaliye bulunamadı.", { status: 404 });
  }

  await prisma.invoice.update({
    where: { id },
    data: { despatchPdfData: new Uint8Array(pdf) },
  });

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    select: { despatchUuid: true, invoiceNo: true },
  });
  const filename = `irsaliye-${invoice?.despatchUuid?.slice(0, 8) || invoice?.invoiceNo || id}.pdf`;

  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
