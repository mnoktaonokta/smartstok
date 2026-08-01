import "server-only";

import type { IErpProvider } from "./IErpProvider";
import type {
  CreateDraftInvoiceResult,
  DraftInvoiceData,
  ErpAbstract,
  ErpAbstractLine,
  ErpCustomer,
  GetCustomerAbstractResult,
  SyncCustomersResult,
} from "./types";

const API_BASE = "https://bizimhesap.com/api/b2b";
const DEFAULT_B2B_KEY = "BZMHB2B724018943908D0B82491F203F";

export type BizimHesapCredentials = {
  firmId: string;
  token: string;
  apiKey: string;
};

function formatAmount(value: number): string {
  const fixed = value.toFixed(2);
  const [intPart, decPart] = fixed.split(".");
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${withThousands}.${decPart}`;
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

export class BizimHesapAdapter implements IErpProvider {
  constructor(private readonly creds: BizimHesapCredentials) {}

  private authHeaders(): Record<string, string> {
    return {
      Key: this.creds.apiKey.trim() || DEFAULT_B2B_KEY,
      Token: this.creds.token.trim(),
      Accept: "application/json",
    };
  }

  private async get(
    path: string,
  ): Promise<
    | { ok: true; status: number; json: unknown; text: string }
    | { ok: false; error: string }
  > {
    const token = this.creds.token.trim();
    if (!token) {
      return {
        ok: false,
        error:
          "Bizim Hesap Token (bhToken) tanımlı değil. Admin → Firma Bilgileri’nden girin.",
      };
    }

    const url = `${API_BASE}${path}`;
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: this.authHeaders(),
        cache: "no-store",
      });
      const text = await res.text();
      let json: unknown = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        console.error(`[BizimHesapAdapter GET ${path}] Non-JSON`, {
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
      console.error(`[BizimHesapAdapter GET ${path}]`, error);
      return {
        ok: false,
        error:
          "Bağlantı Hatası: Bizim Hesap sunucusuna ulaşılamadı. İnternet bağlantınızı kontrol edin.",
      };
    }
  }

  async syncCustomers(): Promise<SyncCustomersResult> {
    const result = await this.get("/customers");
    if (!result.ok) return { ok: false, error: result.error };

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
    const customers: ErpCustomer[] = [];

    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const id = asString(row.id ?? row.Id ?? row.ID);
      const code = asString(row.code ?? row.Code) || null;
      const externalId = id || code;
      if (!externalId) continue;
      const name = asString(row.title ?? row.Title ?? row.name ?? row.Name);
      if (!name) continue;
      const vknTckn = digitsOnly(
        asString(row.taxno ?? row.taxNo ?? row.TaxNo ?? row.vkn ?? row.VKN),
      );
      customers.push({
        externalId,
        code,
        name,
        vknTckn,
        taxOffice:
          asString(row.taxoffice ?? row.taxOffice ?? row.TaxOffice) || null,
        address: asString(row.address ?? row.Address) || null,
        phone: asString(row.phone ?? row.Phone) || null,
        email: asString(row.email ?? row.Email) || null,
      });
    }

    return { ok: true, customers };
  }

  async getCustomerAbstract(vkn: string): Promise<GetCustomerAbstractResult> {
    const id = vkn.trim();
    if (!id) {
      return { ok: false, error: "Cari kod / VKN boş olamaz." };
    }

    const result = await this.get(`/abstract/${encodeURIComponent(id)}`);
    if (!result.ok) return { ok: false, error: result.error };

    const mapped = this.mapAbstract(result.json);
    if (!mapped) {
      return { ok: false, error: "Bizim Hesap ekstre verisi boş veya geçersiz." };
    }

    const root = result.json as { error?: string };
    if (root.error && String(root.error).trim()) {
      return { ok: false, error: String(root.error) };
    }

    return { ok: true, data: mapped };
  }

  async createDraftInvoice(
    invoiceData: DraftInvoiceData,
  ): Promise<CreateDraftInvoiceResult> {
    const firmId = this.creds.firmId.trim();
    if (!firmId) {
      return {
        ok: false,
        error:
          "Bizim Hesap Firm ID (bhFirmId) tanımlı değil. Admin → Firma Bilgileri’nden girin.",
      };
    }

    const payload = {
      firmId,
      invoiceNo: invoiceData.invoiceNo,
      invoiceType: 3,
      note: invoiceData.note || "SmartStok konsinye faturalandırma",
      dates: {
        invoiceDate: invoiceData.invoiceDate,
        dueDate: invoiceData.dueDate,
        deliveryDate: invoiceData.deliveryDate,
      },
      customer: {
        customerId: invoiceData.customer.id,
        title: invoiceData.customer.title,
        address: invoiceData.customer.address,
        taxOffice: invoiceData.customer.taxOffice,
        taxNo: invoiceData.customer.taxNo,
        phone: invoiceData.customer.phone,
        email: invoiceData.customer.email,
      },
      amounts: {
        currency: invoiceData.amounts.currency || "TL",
        gross: formatAmount(invoiceData.amounts.gross),
        discount: formatAmount(invoiceData.amounts.discount),
        net: formatAmount(invoiceData.amounts.net),
        tax: formatAmount(invoiceData.amounts.tax),
        total: formatAmount(invoiceData.amounts.total),
      },
      details: invoiceData.lines.map((line) => ({
        productId: line.productId,
        productName: line.productName,
        note: line.note,
        barcode: line.barcode,
        taxRate: line.taxRate.toFixed(2),
        quantity: line.quantity,
        unitPrice: formatAmount(line.unitPrice),
        grossPrice: formatAmount(line.gross),
        discount: formatAmount(line.discount),
        net: formatAmount(line.net),
        tax: formatAmount(line.tax),
        total: formatAmount(line.total),
      })),
    };

    try {
      const res = await fetch(`${API_BASE}/addinvoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      let data: { error?: string; guid?: string; url?: string } = {};
      try {
        data = JSON.parse(text) as typeof data;
      } catch {
        return {
          ok: false,
          error: `Bizim Hesap yanıtı okunamadı (${res.status}): ${text.slice(0, 200)}`,
        };
      }

      if (!res.ok && !data.error) {
        return { ok: false, error: `Bizim Hesap HTTP ${res.status}` };
      }
      if (data.error) {
        return { ok: false, error: data.error };
      }
      if (!data.guid) {
        return { ok: false, error: "Bizim Hesap GUID dönmedi." };
      }
      return { ok: true, guid: data.guid, url: data.url ?? null };
    } catch (error) {
      console.error("[BizimHesapAdapter.createDraftInvoice]", error);
      return {
        ok: false,
        error: "Bizim Hesap fatura isteği gönderilemedi.",
      };
    }
  }

  private mapAbstract(raw: unknown): ErpAbstract | null {
    if (!raw || typeof raw !== "object") return null;
    const root = raw as Record<string, unknown>;
    const data =
      root.data && typeof root.data === "object"
        ? (root.data as Record<string, unknown>)
        : root;

    const abstractRaw = data.abstract;
    const linesSource = Array.isArray(abstractRaw) ? abstractRaw : [];
    const lines: ErpAbstractLine[] = linesSource.map((row) => {
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
}
