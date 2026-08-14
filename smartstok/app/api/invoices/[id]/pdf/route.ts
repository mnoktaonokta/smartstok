import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canAccessPath } from "@/lib/roles";
import { elogoBinaryToPdf, isPdfBuffer } from "@/lib/services/edocument/zip";
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
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    select: {
      pdfData: true,
      externalViewUrl: true,
      invoiceNo: true,
      faturaNo: true,
      uuid: true,
      belgeOid: true,
      documentType: true,
      eDocumentProvider: true,
    },
  });

  if (!invoice) {
    return new Response("Not found", { status: 404 });
  }

  if (invoice.pdfData && invoice.pdfData.length > 0) {
    let buf = Buffer.from(invoice.pdfData);
    if (!isPdfBuffer(buf)) {
      const unwrapped = await elogoBinaryToPdf(buf);
      if (unwrapped) {
        buf = unwrapped;
        // DB’yi düzelt (eski zip kayıtları)
        await prisma.invoice.update({
          where: { id },
          data: { pdfData: new Uint8Array(unwrapped) },
        });
      } else {
        return new Response(
          "Kayıtlı dosya geçerli PDF değil. Faturalar listesinden PDF’yi yeniden çekin.",
          { status: 422 },
        );
      }
    }

    const filename = `${invoice.faturaNo || invoice.invoiceNo || id}.pdf`;
    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  }

  if (invoice.externalViewUrl) {
    return Response.redirect(invoice.externalViewUrl, 302);
  }

  return new Response("PDF yok", { status: 404 });
}
