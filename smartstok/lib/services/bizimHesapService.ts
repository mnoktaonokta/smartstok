/**
 * Bizim Hesap B2B — cari ekstre, müşteri listesi vb.
 *
 * Auth (GET servisleri — resmi doküman):
 *   Header Key   = sabit B2B anahtarı (BZMHB2B…)
 *   Header Token = Api Key (FirmID) / hesap token
 *
 * Bu dosya yalnızca sunucuda çalışır; Client Component’ten import edilemez.
 */
import "server-only";

import type {
  BizimHesapAbstract,
  BizimHesapAbstractLine,
  BizimHesapCustomerMapped,
  GetAllCustomersResult,
  GetCustomerAbstractResult,
} from "@/lib/services/bizimHesapTypes";

export type {
  BizimHesapAbstract,
  BizimHesapAbstractLine,
  BizimHesapCustomerMapped,
  GetAllCustomersResult,
  GetCustomerAbstractResult,
} from "@/lib/services/bizimHesapTypes";

const API_BASE = "https://bizimhesap.com/api/b2b";

/** Resmi dokümandaki sabit B2B Key */
const BIZIMHESAP_API_KEY =
  process.env.BIZIMHESAP_API_KEY?.trim() ||
  "BZMHB2B724018943908D0B82491F203F";

function getToken(): string | null {
  return process.env.BIZIMHESAP_TOKEN?.trim() || null;
}

function authHeaders(token: string): Record<string, string> {
  return {
    Key: BIZIMHESAP_API_KEY,
    Token: token,
    Accept: "application/json",
  };
}

function maskSecret(value: string) {
  if (value.length <= 8) return "***";
  return `${value.slice(0, 4)}…${value.slice(-4)} (len=${value.length})`;
}

function parseAmount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return 0;

  const trimmed = value.trim();
  if (!trimmed) return 0;

  const hasComma = trimmed.includes(",");
  const hasDot = trimmed.includes(".");

  let normalized = trimmed;
  if (hasComma && hasDot) {
    if (trimmed.lastIndexOf(".") > trimmed.lastIndexOf(",")) {
      normalized = trimmed.replace(/,/g, "");
    } else {
      normalized = trimmed.replace(/\./g, "").replace(",", ".");
    }
  } else if (hasComma) {
    normalized = trimmed.replace(",", ".");
  }

  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function asString(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function mapAbstractPayload(raw: unknown): BizimHesapAbstract | null {
  if (!raw || typeof raw !== "object") return null;

  const root = raw as Record<string, unknown>;
  const data =
    root.data && typeof root.data === "object"
      ? (root.data as Record<string, unknown>)
      : root;

  const abstractRaw = data.abstract;
  const linesSource = Array.isArray(abstractRaw) ? abstractRaw : [];

  const lines: BizimHesapAbstractLine[] = linesSource.map((row) => {
    const r = (row ?? {}) as Record<string, unknown>;
    return {
      date: asString(r.trxdate ?? r.date ?? r.Date),
      type: asString(r.type ?? r.Type),
      note: asString(r.note ?? r.Note ?? r.description),
      debit: parseAmount(r.debit ?? r.Debit ?? r.borc),
      credit: parseAmount(r.credit ?? r.Credit ?? r.alacak),
      balance: parseAmount(r.balance ?? r.Balance ?? r.bakiye),
      payment: asString(r.payment ?? r.Payment) || undefined,
    };
  });

  return {
    title: asString(data.title ?? data.Title),
    email: asString(data.email) || undefined,
    phone: asString(data.phone) || undefined,
    balance: parseAmount(data.balance ?? data.Balance),
    debitSum: parseAmount(data.debitSum ?? data.DebitSum),
    creditSum: parseAmount(data.creditSum ?? data.CreditSum),
    link: asString(data.link) || undefined,
    lines,
  };
}

function mapCustomerRow(
  row: Record<string, unknown>,
): BizimHesapCustomerMapped | null {
  const id = asString(row.id ?? row.Id ?? row.ID);
  const code = asString(row.code ?? row.Code) || null;
  const bizimHesapId = id || code;
  if (!bizimHesapId) return null;

  const name = asString(row.title ?? row.Title ?? row.name ?? row.Name);
  if (!name) return null;

  const vknTckn = digitsOnly(
    asString(row.taxno ?? row.taxNo ?? row.TaxNo ?? row.vkn ?? row.VKN),
  );

  return {
    bizimHesapId,
    code,
    name,
    vknTckn,
    taxOffice:
      asString(row.taxoffice ?? row.taxOffice ?? row.TaxOffice) || null,
    address: asString(row.address ?? row.Address) || null,
    phone: asString(row.phone ?? row.Phone) || null,
    email: asString(row.email ?? row.Email) || null,
  };
}

async function bizimHesapGet(
  path: string,
): Promise<
  | { ok: true; status: number; json: unknown; text: string }
  | { ok: false; error: string }
> {
  const token = getToken();
  if (!token) {
    return {
      ok: false,
      error:
        "Bizim Hesap yapılandırması eksik: BIZIMHESAP_TOKEN tanımlı değil veya boş. " +
        "Üyelik Bilgileri’ndeki Api Key (FirmID) değerini kullanın.",
    };
  }

  const url = `${API_BASE}${path}`;
  const headers = authHeaders(token);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers,
      cache: "no-store",
    });

    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      console.error(`[BizimHesap GET ${path}] Non-JSON`, {
        status: res.status,
        bodyPreview: text.slice(0, 500),
        Token: maskSecret(token),
      });
      return {
        ok: false,
        error: `Bizim Hesap yanıtı okunamadı (HTTP ${res.status}).`,
      };
    }

    if (!res.ok) {
      console.error(`[BizimHesap GET ${path}] HTTP hata`, {
        status: res.status,
        responseJson: json,
        responseText: text.slice(0, 1000),
        Token: maskSecret(token),
      });
      const errObj = json as { error?: string; message?: string } | null;
      const apiMsg = errObj?.error || errObj?.message || "";
      return {
        ok: false,
        error: apiMsg
          ? `HTTP ${res.status} — ${apiMsg}`
          : `Bizim Hesap HTTP ${res.status}`,
      };
    }

    return { ok: true, status: res.status, json, text };
  } catch (error) {
    console.error(`[BizimHesap GET ${path}] Ağ hatası`, error);
    return {
      ok: false,
      error:
        "Bağlantı Hatası: Bizim Hesap sunucusuna ulaşılamadı. İnternet bağlantınızı kontrol edin.",
    };
  }
}

/**
 * Bizim Hesap cari ekstresini getirir.
 * @param customerId Bizim Hesap’taki cari / müşteri kodu (SmartStok Customer.bizimHesapId)
 */
export async function getCustomerAbstract(
  customerId: string,
): Promise<GetCustomerAbstractResult> {
  const id = customerId.trim();
  if (!id) {
    return { ok: false, error: "Bizim Hesap müşteri kodu boş olamaz." };
  }

  const result = await bizimHesapGet(`/abstract/${encodeURIComponent(id)}`);
  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  const mapped = mapAbstractPayload(result.json);
  if (!mapped) {
    console.error("[BizimHesap abstract] Boş/geçersiz payload", {
      json: result.json,
    });
    return { ok: false, error: "Bizim Hesap ekstre verisi boş veya geçersiz." };
  }

  const root = result.json as { error?: string };
  if (root.error && String(root.error).trim()) {
    return { ok: false, error: String(root.error) };
  }

  return { ok: true, data: mapped };
}

/**
 * Bizim Hesap’taki tüm müşterileri listeler.
 * GET /api/b2b/customers
 */
export async function getAllCustomers(): Promise<GetAllCustomersResult> {
  const result = await bizimHesapGet("/customers");
  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  const root = result.json as Record<string, unknown>;
  if (root.error && String(root.error).trim()) {
    return { ok: false, error: String(root.error) };
  }

  const data =
    root.data && typeof root.data === "object"
      ? (root.data as Record<string, unknown>)
      : root;

  const rawList = data.customers ?? data.Customers ?? root.customers;
  const list = Array.isArray(rawList) ? rawList : [];

  const customers: BizimHesapCustomerMapped[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const mapped = mapCustomerRow(item as Record<string, unknown>);
    if (mapped) customers.push(mapped);
  }

  return { ok: true, customers };
}
