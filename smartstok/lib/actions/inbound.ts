"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ensureMainDepot } from "@/lib/inventory";
import {
  assertCanMutate,
  canAccessInboundReceipt,
  hasRole,
  mutationDeniedMessage,
} from "@/lib/roles";
import type { UserRole } from "@/types/next-auth";
import type { ActionResult } from "@/lib/actions/customers";
import type { ParsedInvoiceLine } from "@/lib/actions/invoice-parser";

export type ScannedInboundLine = {
  productId: string;
  referenceCode: string;
  productName: string;
  quantity: number;
  lotNumber: string;
  expiryDate: string | null; // YYYY-MM-DD
  unitPrice?: number | null;
};

const scannedLineSchema = z.object({
  productId: z.string().min(1),
  referenceCode: z.string().min(1),
  productName: z.string().min(1),
  quantity: z.number().int().positive().max(5000),
  lotNumber: z.string().trim().min(1),
  expiryDate: z.string().nullable().optional(),
  unitPrice: z.number().nonnegative().nullable().optional(),
});

const confirmSchema = z.object({
  mode: z.enum(["invoice", "manual"]),
  supplierName: z.string().trim().optional().nullable(),
  documentNumber: z.string().trim().optional().nullable(),
  invoiceLines: z
    .array(
      z.object({
        productName: z.string(),
        referenceCode: z.string(),
        quantity: z.number().int().nonnegative(),
        unitPrice: z.number().nonnegative(),
      }),
    )
    .default([]),
  scannedLines: z.array(scannedLineSchema).min(1, "Sepet boş."),
  acknowledgeDiscrepancy: z.boolean().default(false),
});

export type InboundReceiptListItem = {
  id: string;
  supplierName: string | null;
  documentNumber: string | null;
  status: "PENDING" | "COMPLETED" | "DISCREPANCY";
  discrepancyNote: string | null;
  createdAt: string;
  createdByName: string | null;
};

function buildDiscrepancyNote(
  invoiceLines: ParsedInvoiceLine[],
  scannedLines: ScannedInboundLine[],
): { hasDiscrepancy: boolean; note: string; missing: string[]; extra: string[] } {
  const invByRef = new Map<string, { qty: number; name: string }>();
  for (const line of invoiceLines) {
    const key = line.referenceCode.trim().toUpperCase();
    const prev = invByRef.get(key);
    invByRef.set(key, {
      qty: (prev?.qty ?? 0) + line.quantity,
      name: line.productName,
    });
  }

  const scanByRef = new Map<string, { qty: number; name: string }>();
  for (const line of scannedLines) {
    const key = line.referenceCode.trim().toUpperCase();
    const prev = scanByRef.get(key);
    scanByRef.set(key, {
      qty: (prev?.qty ?? 0) + line.quantity,
      name: line.productName,
    });
  }

  const missing: string[] = [];
  const extra: string[] = [];

  for (const [ref, inv] of invByRef) {
    const scan = scanByRef.get(ref);
    if (!scan) {
      missing.push(`${inv.name} (${ref}): faturada ${inv.qty}, okutulan 0`);
    } else if (scan.qty < inv.qty) {
      missing.push(
        `${inv.name} (${ref}): faturada ${inv.qty}, okutulan ${scan.qty} (eksik ${inv.qty - scan.qty})`,
      );
    } else if (scan.qty > inv.qty) {
      extra.push(
        `${scan.name} (${ref}): faturada ${inv.qty}, okutulan ${scan.qty} (fazla ${scan.qty - inv.qty})`,
      );
    }
  }

  for (const [ref, scan] of scanByRef) {
    if (!invByRef.has(ref)) {
      extra.push(
        `${scan.name} (${ref}): faturada yok, okutulan ${scan.qty}`,
      );
    }
  }

  const hasDiscrepancy = missing.length > 0 || extra.length > 0;
  const parts: string[] = [];
  if (missing.length) {
    parts.push("EKSİK / EŞLEŞMEYEN:\n" + missing.map((m) => `• ${m}`).join("\n"));
  }
  if (extra.length) {
    parts.push(
      "FAZLA / FATURADA OLMAYAN:\n" + extra.map((m) => `• ${m}`).join("\n"),
    );
  }

  return {
    hasDiscrepancy,
    note: parts.join("\n\n") || "Uyumsuzluk yok.",
    missing,
    extra,
  };
}

export async function confirmInboundReceiptAction(
  input: z.infer<typeof confirmSchema>,
): Promise<
  ActionResult<{
    receiptId: string;
    status: string;
    createdCount: number;
    needsAck?: boolean;
    discrepancyPreview?: string;
  }>
> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { error: "Oturum bulunamadı." };
    }
    if (!canAccessInboundReceipt(session.user.roles as UserRole[])) {
      return { error: "Mal kabul için Admin veya Depo yetkisi gerekli." };
    }
    assertCanMutate(session.user.roles);

    const parsed = confirmSchema.safeParse(input);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Geçersiz form." };
    }

    const { mode, invoiceLines, scannedLines } = parsed.data;

    if (mode === "invoice" && invoiceLines.length === 0) {
      return { error: "Önce faturayı yükleyip AI analizini tamamlayın." };
    }

    let discrepancy = {
      hasDiscrepancy: false,
      note: "",
      missing: [] as string[],
      extra: [] as string[],
    };

    if (mode === "invoice") {
      const normalizedScan: ScannedInboundLine[] = scannedLines.map((l) => ({
        ...l,
        expiryDate: l.expiryDate ?? null,
      }));
      discrepancy = buildDiscrepancyNote(invoiceLines, normalizedScan);
      if (
        discrepancy.hasDiscrepancy &&
        discrepancy.extra.length > 0 &&
        !parsed.data.acknowledgeDiscrepancy
      ) {
        return {
          success: false,
          data: {
            receiptId: "",
            status: "DISCREPANCY",
            createdCount: 0,
            needsAck: true,
            discrepancyPreview: discrepancy.note,
          },
          error:
            "Faturada görünmeyen veya fazla miktarda ürün okuttunuz. Stoklara bu şekilde eklemek istediğinize emin misiniz?",
        };
      }
    }

    const mainDepot = await ensureMainDepot();
    let createdCount = 0;
    let receiptId = "";

    const priceByRef = new Map<string, number>();
    for (const line of invoiceLines) {
      priceByRef.set(
        line.referenceCode.trim().toUpperCase(),
        line.unitPrice,
      );
    }

    await prisma.$transaction(async (tx) => {
      for (const line of scannedLines) {
        const product = await tx.product.findUnique({
          where: { id: line.productId },
        });
        if (!product) {
          throw new Error(`Ürün bulunamadı: ${line.referenceCode}`);
        }

        const lotNumber = line.lotNumber.trim().toUpperCase();
        const expiry =
          line.expiryDate && line.expiryDate.length >= 8
            ? new Date(line.expiryDate)
            : null;

        await tx.stockItem.createMany({
          data: Array.from({ length: line.quantity }, () => ({
            productId: product.id,
            lotNumber,
            expiryDate: expiry && !Number.isNaN(expiry.getTime()) ? expiry : null,
            locationId: mainDepot.id,
            isAvailable: true,
          })),
        });
        createdCount += line.quantity;

        const unitPrice =
          line.unitPrice ??
          priceByRef.get(line.referenceCode.trim().toUpperCase());
        if (unitPrice != null && unitPrice >= 0) {
          await tx.product.update({
            where: { id: product.id },
            data: { purchasePrice: unitPrice },
          });
        }
      }

      for (const inv of invoiceLines) {
        const ref = inv.referenceCode.trim();
        const product = await tx.product.findFirst({
          where: {
            referenceCode: { equals: ref, mode: "insensitive" },
          },
        });
        if (product && inv.unitPrice >= 0) {
          await tx.product.update({
            where: { id: product.id },
            data: { purchasePrice: inv.unitPrice },
          });
        }
      }

      const status =
        mode === "invoice" && discrepancy.hasDiscrepancy
          ? ("DISCREPANCY" as const)
          : ("COMPLETED" as const);

      const receipt = await tx.inboundReceipt.create({
        data: {
          supplierName: parsed.data.supplierName || null,
          documentNumber: parsed.data.documentNumber || null,
          status,
          discrepancyNote:
            mode === "invoice" && discrepancy.hasDiscrepancy
              ? discrepancy.note
              : null,
          invoiceLinesJson: JSON.stringify(invoiceLines),
          scannedLinesJson: JSON.stringify(scannedLines),
          createdById: session.user!.id,
          completedAt: status === "COMPLETED" ? new Date() : null,
        },
      });
      receiptId = receipt.id;
    });

    const status =
      mode === "invoice" && discrepancy.hasDiscrepancy
        ? "DISCREPANCY"
        : "COMPLETED";

    revalidatePath("/dashboard/malkabul");
    revalidatePath("/dashboard/stock-entry");
    revalidatePath("/dashboard/depots");
    revalidatePath("/dashboard/products");

    return {
      success: true,
      data: {
        receiptId,
        status,
        createdCount,
      },
    };
  } catch (error) {
    const denied = mutationDeniedMessage(error);
    if (denied) return { error: denied };
    console.error("[confirmInboundReceiptAction]", error);
    return {
      error:
        error instanceof Error
          ? error.message
          : "Mal kabul kaydı oluşturulamadı.",
    };
  }
}

export async function listInboundReceiptsAction(): Promise<
  InboundReceiptListItem[]
> {
  const session = await auth();
  if (!canAccessInboundReceipt(session?.user?.roles as UserRole[] | undefined)) {
    return [];
  }

  const rows = await prisma.inboundReceipt.findMany({
    orderBy: { createdAt: "desc" },
    take: 40,
    include: {
      createdBy: { select: { fullName: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    supplierName: r.supplierName,
    documentNumber: r.documentNumber,
    status: r.status,
    discrepancyNote: r.discrepancyNote,
    createdAt: r.createdAt.toISOString(),
    createdByName: r.createdBy?.fullName ?? null,
  }));
}

export async function resolveInboundDiscrepancyAction(
  receiptId: string,
): Promise<ActionResult> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { error: "Oturum bulunamadı." };
    }
    if (!hasRole(session.user.roles, "ADMIN")) {
      return { error: "Uyumsuzluk kapatma yalnızca Admin yetkisiyle yapılır." };
    }

    const existing = await prisma.inboundReceipt.findUnique({
      where: { id: receiptId },
      select: { id: true, status: true },
    });
    if (!existing) return { error: "Kayıt bulunamadı." };
    if (existing.status !== "DISCREPANCY") {
      return { error: "Bu kayıt uyumsuzluk durumunda değil." };
    }

    await prisma.inboundReceipt.update({
      where: { id: receiptId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
      },
    });

    revalidatePath("/dashboard/malkabul");
    return { success: true };
  } catch (error) {
    console.error("[resolveInboundDiscrepancyAction]", error);
    return { error: "Kayıt güncellenemedi." };
  }
}
