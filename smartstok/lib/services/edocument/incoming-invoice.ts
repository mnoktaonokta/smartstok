import type { IncomingAppStatus, IncomingInvoice } from "./types";

/** Ticari e-fatura uygulama yanıtı süresi (GİB). */
export const INCOMING_RESPONSE_WINDOW_DAYS = 8;

export function mapAppRespResult(
  raw: string | null | undefined,
): IncomingAppStatus {
  const v = (raw ?? "").trim();
  if (v === "1" || /^kabul$/i.test(v)) return "ACCEPTED";
  if (v === "2" || /^red$/i.test(v)) return "REJECTED";
  if (v === "3") return "AUTO_ACCEPTED";
  if (v === "4") return "NOT_APPLICABLE";
  return "NONE";
}

export function isTicariProfile(profileId: string | null | undefined) {
  return (profileId ?? "").toUpperCase().includes("TICARI");
}

export function isTemelProfile(profileId: string | null | undefined) {
  const p = (profileId ?? "").toUpperCase();
  return p.includes("TEMEL") || p === "4";
}

function parseDay(value: string | null | undefined): Date | null {
  if (!value) return null;
  const day = value.slice(0, 10);
  const d = new Date(`${day}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function incomingResponseEligibility(inv: IncomingInvoice): {
  canAccept: boolean;
  canReject: boolean;
  reason: string;
  daysLeft: number | null;
} {
  if (inv.appStatus === "ACCEPTED") {
    return {
      canAccept: false,
      canReject: false,
      reason: "Bu fatura kabul edilmiş.",
      daysLeft: null,
    };
  }
  if (inv.appStatus === "REJECTED") {
    return {
      canAccept: false,
      canReject: false,
      reason: "Bu fatura reddedilmiş.",
      daysLeft: null,
    };
  }
  if (inv.appStatus === "AUTO_ACCEPTED") {
    return {
      canAccept: false,
      canReject: false,
      reason: "8 gün dolduğu için otomatik kabul sayıldı.",
      daysLeft: 0,
    };
  }
  if (inv.appStatus === "NOT_APPLICABLE" || isTemelProfile(inv.profileId)) {
    return {
      canAccept: false,
      canReject: false,
      reason: "Temel faturada uygulama yanıtı (kabul/red) yok.",
      daysLeft: null,
    };
  }
  if (inv.profileId && !isTicariProfile(inv.profileId)) {
    return {
      canAccept: false,
      canReject: false,
      reason: "Bu senaryoda kabul/red gönderilmez.",
      daysLeft: null,
    };
  }

  const start = parseDay(inv.receivedAt) ?? parseDay(inv.issueDate);
  if (!start) {
    return {
      canAccept: true,
      canReject: true,
      reason: "Ticari fatura — yanıt süresi belge tarihinden hesaplanamadı.",
      daysLeft: null,
    };
  }

  const deadline = new Date(start);
  deadline.setDate(deadline.getDate() + INCOMING_RESPONSE_WINDOW_DAYS);
  const msLeft = deadline.getTime() - Date.now();
  const daysLeft = Math.ceil(msLeft / (24 * 60 * 60 * 1000));
  if (daysLeft <= 0) {
    return {
      canAccept: false,
      canReject: false,
      reason: "8 gün doldu; ticari fatura kabul edilmiş sayılır.",
      daysLeft: 0,
    };
  }

  return {
    canAccept: true,
    canReject: true,
    reason: `Ticari fatura — yanıt için ${daysLeft} gün kaldı.`,
    daysLeft,
  };
}

export function mockIncomingInvoices(): IncomingInvoice[] {
  const today = new Date();
  const iso = (offset: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
  };
  return [
    {
      uuid: "11111111-1111-4111-8111-111111111111",
      invoiceNo: "ABC2026000000001",
      issueDate: iso(-2),
      receivedAt: iso(-2),
      supplierName: "Örnek Tedarikçi A.Ş.",
      supplierVkn: "1234567801",
      payableAmount: "12500.00",
      currency: "TRY",
      profileId: "TICARIFATURA",
      appStatus: "NONE",
      gbAlias: "urn:mail:defaultgb@elogo.com.tr",
    },
    {
      uuid: "22222222-2222-4222-8222-222222222222",
      invoiceNo: "XYZ2026000000044",
      issueDate: iso(-10),
      receivedAt: iso(-10),
      supplierName: "Temel Senaryo Ltd.",
      supplierVkn: "1111111111",
      payableAmount: "840.50",
      currency: "TRY",
      profileId: "TEMELFATURA",
      appStatus: "NOT_APPLICABLE",
      gbAlias: null,
    },
    {
      uuid: "33333333-3333-4333-8333-333333333333",
      invoiceNo: "KBL2026000000099",
      issueDate: iso(-5),
      receivedAt: iso(-5),
      supplierName: "Kabul Edilmiş Tedarik",
      supplierVkn: "2222222222",
      payableAmount: "3100.00",
      currency: "TRY",
      profileId: "TICARIFATURA",
      appStatus: "ACCEPTED",
      gbAlias: null,
    },
  ];
}
