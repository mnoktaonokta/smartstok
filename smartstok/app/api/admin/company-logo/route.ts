import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { toArrayBufferBytes } from "@/lib/bytes";
import { hasRole } from "@/lib/roles";
import { SINGLETON_ID } from "@/lib/services/erp/company-settings";

const MAX_LOGO_BYTES = Math.floor(1.5 * 1024 * 1024);
const ALLOWED = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);

function mimeFromFileName(name: string): string | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return null;
}

function revalidateLogoPaths() {
  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/admin/firma-bilgileri");
  revalidatePath("/dashboard/invoices");
  revalidatePath("/dashboard/e-belge-fatura");
}

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id || !hasRole(session.user.roles, "ADMIN")) {
    return false;
  }
  return true;
}

/** Firma logosunu binary olarak döner (önizleme / fatura). */
export async function GET() {
  if (!(await requireAdmin())) {
    return new Response("Unauthorized", { status: 401 });
  }

  const row = await prisma.companySettings.findUnique({
    where: { id: SINGLETON_ID },
    select: { logoData: true, logoMimeType: true },
  });

  if (!row?.logoData?.length || !row.logoMimeType) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(toArrayBufferBytes(row.logoData), {
    status: 200,
    headers: {
      "Content-Type": row.logoMimeType,
      "Cache-Control": "no-store",
    },
  });
}

/** Logo yükle — multipart FormData (`logo` alanı). */
export async function POST(request: Request) {
  if (!(await requireAdmin())) {
    return Response.json({ error: "Yetkisiz." }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const raw = formData.get("logo");
    const blob =
      raw &&
      typeof raw === "object" &&
      "arrayBuffer" in raw &&
      typeof (raw as Blob).arrayBuffer === "function"
        ? (raw as Blob)
        : null;

    if (!blob || blob.size === 0) {
      return Response.json({ error: "Logo dosyası seçin." }, { status: 400 });
    }
    if (blob.size > MAX_LOGO_BYTES) {
      return Response.json(
        { error: "Logo en fazla 1,5 MB olabilir." },
        { status: 400 },
      );
    }

    const fileName =
      "name" in blob && typeof (blob as File).name === "string"
        ? (blob as File).name
        : "";
    const mime =
      (blob.type && blob.type.trim()) || mimeFromFileName(fileName) || "";
    const normalizedMime =
      mime === "image/jpg" ? "image/jpeg" : mime.toLowerCase();
    if (!ALLOWED.has(normalizedMime)) {
      return Response.json(
        {
          error: `Desteklenmeyen dosya türü${mime ? ` (${mime})` : ""}. PNG, JPEG, WebP veya GIF yükleyin.`,
        },
        { status: 400 },
      );
    }

    const bytes = toArrayBufferBytes(
      new Uint8Array(await blob.arrayBuffer()),
    );
    const mimeStored =
      normalizedMime === "image/jpg" ? "image/jpeg" : normalizedMime;

    const row = await prisma.companySettings.upsert({
      where: { id: SINGLETON_ID },
      create: {
        id: SINGLETON_ID,
        logoData: bytes,
        logoMimeType: mimeStored,
      },
      update: {
        logoData: bytes,
        logoMimeType: mimeStored,
      },
      select: { updatedAt: true, logoMimeType: true },
    });

    revalidateLogoPaths();

    const logoPreviewUrl = row.logoMimeType
      ? `/api/admin/company-logo?v=${row.updatedAt.getTime()}`
      : null;

    return Response.json({
      success: true,
      logoPreviewUrl,
      hasLogo: Boolean(row.logoMimeType),
    });
  } catch (error) {
    console.error("[POST /api/admin/company-logo]", error);
    const msg =
      error instanceof Error
        ? error.message.replace(/\s+/g, " ").trim().slice(0, 220)
        : "Logo yüklenemedi.";
    return Response.json({ error: msg || "Logo yüklenemedi." }, { status: 500 });
  }
}

/** Logo kaldır. */
export async function DELETE() {
  if (!(await requireAdmin())) {
    return Response.json({ error: "Yetkisiz." }, { status: 401 });
  }

  try {
    await prisma.companySettings.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, logoData: null, logoMimeType: null },
      update: { logoData: null, logoMimeType: null },
    });
    revalidateLogoPaths();
    return Response.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/admin/company-logo]", error);
    return Response.json({ error: "Logo silinemedi." }, { status: 500 });
  }
}
