"use server";

import { z } from "zod";
import { auth } from "@/auth";
import { assertCanMutate, canAccessPath } from "@/lib/roles";
import { EDocumentFactory } from "@/lib/services/edocument/EDocumentFactory";
import { incomingResponseEligibility } from "@/lib/services/edocument/incoming-invoice";
import type { IncomingInvoice } from "@/lib/services/edocument/types";
import type { UserRole } from "@/types/next-auth";

const rangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const respondSchema = z.object({
  uuid: z.string().min(8),
  decision: z.enum(["KABUL", "RED"]),
  description: z.string().max(500).optional(),
  alias: z.string().optional(),
  profileId: z.string().nullable().optional(),
  appStatus: z.string().optional(),
  issueDate: z.string().nullable().optional(),
  receivedAt: z.string().nullable().optional(),
});

function assertCanSeeInvoices(roles: UserRole[] | undefined) {
  if (!canAccessPath(roles, "/dashboard/invoices")) {
    throw new Error("Bu sayfaya erişim yetkiniz yok.");
  }
}

export async function listIncomingInvoicesAction(input: {
  from: string;
  to: string;
}): Promise<{ invoices?: IncomingInvoice[]; error?: string }> {
  try {
    const session = await auth();
    if (!session?.user?.id) return { error: "Oturum bulunamadı." };
    assertCanSeeInvoices(session.user.roles);

    const parsed = rangeSchema.safeParse(input);
    if (!parsed.success) return { error: "Tarih aralığı geçersiz." };

    const from = new Date(`${parsed.data.from}T00:00:00`);
    const to = new Date(`${parsed.data.to}T00:00:00`);
    if (to.getTime() < from.getTime()) {
      return { error: "Bitiş tarihi başlangıçtan önce olamaz." };
    }
    const span = (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000);
    if (span > 90) {
      return { error: "Tarih aralığı en fazla 90 gün olabilir." };
    }

    const factory = await EDocumentFactory.getInstance();
    if (!factory.ok) return { error: factory.error };

    const listed = await factory.provider.listIncomingInvoices(parsed.data);
    if (!listed.ok) return { error: listed.error };
    return { invoices: listed.invoices };
  } catch (error) {
    console.error("[listIncomingInvoicesAction]", error);
    return {
      error:
        error instanceof Error
          ? error.message
          : "Gelen faturalar alınırken hata oluştu.",
    };
  }
}

export async function respondIncomingInvoiceAction(
  input: z.infer<typeof respondSchema>,
): Promise<{ error?: string; success?: boolean }> {
  try {
    const session = await auth();
    if (!session?.user?.id) return { error: "Oturum bulunamadı." };
    assertCanSeeInvoices(session.user.roles);
    assertCanMutate(session.user.roles);

    const parsed = respondSchema.safeParse(input);
    if (!parsed.success) return { error: "Yanıt bilgileri geçersiz." };

    if (parsed.data.decision === "RED" && !parsed.data.description?.trim()) {
      return { error: "Red için açıklama zorunlu." };
    }

    const eligibility = incomingResponseEligibility({
      uuid: parsed.data.uuid,
      invoiceNo: null,
      issueDate: parsed.data.issueDate ?? null,
      receivedAt: parsed.data.receivedAt ?? null,
      supplierName: null,
      supplierVkn: null,
      payableAmount: null,
      currency: null,
      profileId: parsed.data.profileId ?? null,
      appStatus: (parsed.data.appStatus as IncomingInvoice["appStatus"]) ?? "NONE",
      gbAlias: parsed.data.alias ?? null,
    });
    if (parsed.data.decision === "KABUL" && !eligibility.canAccept) {
      return { error: eligibility.reason };
    }
    if (parsed.data.decision === "RED" && !eligibility.canReject) {
      return { error: eligibility.reason };
    }

    const factory = await EDocumentFactory.getInstance();
    if (!factory.ok) return { error: factory.error };

    const sent = await factory.provider.sendIncomingResponse({
      uuid: parsed.data.uuid,
      decision: parsed.data.decision,
      description:
        parsed.data.description?.trim() ||
        (parsed.data.decision === "KABUL" ? "Kabul edilmiştir." : "Reddedilmiştir."),
      alias: parsed.data.alias,
    });
    if (!sent.ok) return { error: sent.error };
    return { success: true };
  } catch (error) {
    console.error("[respondIncomingInvoiceAction]", error);
    return {
      error:
        error instanceof Error
          ? error.message
          : "Uygulama yanıtı gönderilirken hata oluştu.",
    };
  }
}

export async function downloadIncomingInvoicePdfAction(
  uuid: string,
): Promise<{ pdfBase64?: string; error?: string }> {
  try {
    const session = await auth();
    if (!session?.user?.id) return { error: "Oturum bulunamadı." };
    assertCanSeeInvoices(session.user.roles);

    const id = uuid.trim();
    if (id.length < 8) return { error: "Geçersiz UUID." };

    const factory = await EDocumentFactory.getInstance();
    if (!factory.ok) return { error: factory.error };

    const dl = await factory.provider.downloadIncoming(id);
    if (!dl.ok) return { error: dl.error };
    if (!dl.pdfBase64) return { error: "PDF verisi dönmedi." };
    return { pdfBase64: dl.pdfBase64 };
  } catch (error) {
    console.error("[downloadIncomingInvoicePdfAction]", error);
    return {
      error:
        error instanceof Error ? error.message : "PDF indirilirken hata oluştu.",
    };
  }
}
