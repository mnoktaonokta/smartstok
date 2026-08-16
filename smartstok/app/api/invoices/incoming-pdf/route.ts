import { auth } from "@/auth";
import { toArrayBufferBytes } from "@/lib/bytes";
import { canAccessPath } from "@/lib/roles";
import { downloadIncomingInvoicePdfAction } from "@/lib/actions/incoming-invoices";
import { elogoBinaryToPdf, isPdfBuffer } from "@/lib/services/edocument/zip";
import type { UserRole } from "@/types/next-auth";

export async function GET(req: Request) {
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

  const uuid = new URL(req.url).searchParams.get("uuid")?.trim() ?? "";
  if (uuid.length < 8) {
    return new Response("Geçersiz UUID", { status: 400 });
  }

  const result = await downloadIncomingInvoicePdfAction(uuid);
  if (result.error || !result.pdfBase64) {
    return new Response(result.error ?? "PDF yok", { status: 404 });
  }

  const raw = Buffer.from(result.pdfBase64.replace(/\s+/g, ""), "base64");
  let pdfBytes = toArrayBufferBytes(raw);
  if (!isPdfBuffer(raw)) {
    const unwrapped = await elogoBinaryToPdf(raw);
    if (!unwrapped) {
      return new Response("Dönen dosya geçerli PDF değil.", { status: 422 });
    }
    pdfBytes = toArrayBufferBytes(unwrapped);
  }

  return new Response(pdfBytes, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${uuid}.pdf"`,
      "Cache-Control": "private, max-age=60",
    },
  });
}
