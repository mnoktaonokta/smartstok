"use server";

/**
 * Fatura OCR / AI analizi.
 * AI_API_KEY (veya OPENAI_API_KEY) doluysa OpenAI gpt-4o vision çalışır.
 */

export type ParsedInvoiceLine = {
  productName: string;
  referenceCode: string;
  quantity: number;
  unitPrice: number;
  lot?: string;
  skt?: string;
};

export type ParseInvoiceResult = {
  error?: string;
  lines?: ParsedInvoiceLine[];
  supplierName?: string;
  invoiceNumber?: string;
  source?: "openai";
};

function getAiApiKey() {
  return (
    process.env.AI_API_KEY?.trim() ||
    process.env.OPENAI_API_KEY?.trim() ||
    ""
  );
}

function extensionOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i >= 0 ? filename.slice(i + 1).toLowerCase() : "";
}

function resolveMimeType(file: File): string {
  const raw = (file.type || "").trim().toLowerCase();
  if (
    raw === "image/jpeg" ||
    raw === "image/jpg" ||
    raw === "image/png" ||
    raw === "image/gif" ||
    raw === "image/webp" ||
    raw === "application/pdf"
  ) {
    return raw === "image/jpg" ? "image/jpeg" : raw;
  }

  switch (extensionOf(file.name || "")) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "pdf":
      return "application/pdf";
    default:
      return "";
  }
}

function isVisionImageMime(mime: string): boolean {
  return (
    mime === "image/jpeg" ||
    mime === "image/png" ||
    mime === "image/gif" ||
    mime === "image/webp"
  );
}

function buildDataUrl(mime: string, base64: string): string {
  const trimmed = base64.trim();
  if (trimmed.startsWith("data:")) return trimmed;
  return `data:${mime};base64,${trimmed}`;
}

type OpenAiContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | {
      type: "file";
      file: { filename: string; file_data: string };
    };

const SYSTEM_PROMPT = `Sen bir fatura / irsaliye okuma asistanısın. Verilen belgeyi analiz et ve yalnızca geçerli bir JSON nesnesi döndür.
JSON şeması:
{
  "supplierName": "Faturayı kesen firma/tedarikçi adı (bulamazsa boş string)",
  "invoiceNumber": "Fatura numarası veya irsaliye numarası (bulamazsa boş string)",
  "items": [
    {
      "name": "Ürün Adı",
      "quantity": 10,
      "price": 770,
      "lot": "varsa lot/parti no yoksa boş string",
      "skt": "varsa son kullanma tarihi (YYYY-MM-DD tercih) yoksa boş string",
      "referenceCode": "varsa ürün kodu/barkod/referans yoksa boş string"
    }
  ]
}
Kurallar:
- quantity ve price sayı olmalı.
- Açıklama veya markdown yazma; sadece JSON döndür.
- Hiç ürün bulamazsan items boş dizi olsun.`;

function buildUserContent(
  file: File,
  mime: string,
  base64: string,
): OpenAiContentPart[] {
  const dataUrl = buildDataUrl(mime, base64);
  const parts: OpenAiContentPart[] = [
    {
      type: "text",
      text: "Bu faturayı / irsaliyeyi analiz et ve istenen JSON formatında yanıt ver (json).",
    },
  ];

  if (isVisionImageMime(mime)) {
    parts.push({
      type: "image_url",
      image_url: { url: dataUrl },
    });
    return parts;
  }

  if (mime === "application/pdf") {
    parts.push({
      type: "file",
      file: {
        filename: file.name || "fatura.pdf",
        file_data: dataUrl,
      },
    });
    return parts;
  }

  throw new Error(
    "Desteklenmeyen dosya tipi. JPEG, PNG, WEBP, GIF veya PDF yükleyin.",
  );
}

function slugRef(name: string, index: number): string {
  const base = name
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)
    .toUpperCase();
  return base || `SATIR-${index + 1}`;
}

function mapAiItems(rawItems: unknown): ParsedInvoiceLine[] {
  if (!Array.isArray(rawItems)) return [];

  return rawItems
    .map((row, index) => {
      if (!row || typeof row !== "object") return null;
      const r = row as Record<string, unknown>;

      const productName = String(
        r.name ?? r.productName ?? "",
      ).trim();
      const quantity = Number(r.quantity);
      const unitPrice = Number(r.price ?? r.unitPrice);
      const lot = String(r.lot ?? "").trim();
      const skt = String(r.skt ?? r.expiryDate ?? "").trim();
      const referenceCode =
        String(r.referenceCode ?? r.code ?? r.barcode ?? "").trim() ||
        lot ||
        slugRef(productName, index);

      if (!productName || !Number.isFinite(quantity)) return null;

      return {
        productName,
        referenceCode,
        quantity: Math.max(1, Math.round(quantity)),
        unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
        lot: lot || undefined,
        skt: skt || undefined,
      };
    })
    .filter((l): l is ParsedInvoiceLine => l != null);
}

function parseJsonContent(rawContent: string): Record<string, unknown> {
  try {
    return JSON.parse(rawContent) as Record<string, unknown>;
  } catch {
    const match = rawContent.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error("AI yanıtı JSON formatında değil.");
    }
    return JSON.parse(match[0]) as Record<string, unknown>;
  }
}

/**
 * Fatura dosyasını AI ile analiz eder.
 */
export async function parseInvoiceWithAiAction(
  formData: FormData,
): Promise<ParseInvoiceResult> {
  try {
    const apiKey = getAiApiKey();
    if (!apiKey) {
      return {
        error:
          "API Anahtarı eksik. .env dosyasına AI_API_KEY (veya OPENAI_API_KEY) ekleyin.",
      };
    }

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { error: "Dosya seçilmedi." };
    }

    const maxBytes = 20 * 1024 * 1024;
    if (file.size > maxBytes) {
      return {
        error:
          "Dosya çok büyük. Lütfen 20 MB altı bir fatura görseli/PDF yükleyin.",
      };
    }

    const mime = resolveMimeType(file);
    if (!mime) {
      return {
        error:
          "Dosya tipi anlaşılamadı. JPEG, PNG, WEBP, GIF veya PDF yükleyin.",
      };
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString("base64");
    const content = buildUserContent(file, mime, base64);

    const payload = {
      model: "gpt-4o",
      messages: [
        { role: "system" as const, content: SYSTEM_PROMPT },
        { role: "user" as const, content },
      ],
      response_format: { type: "json_object" as const },
      max_tokens: 4096,
    };

    console.log("[parseInvoiceWithAiAction] istek özeti", {
      model: payload.model,
      mime,
      fileName: file.name,
      fileSize: file.size,
      contentTypes: content.map((c) => c.type),
    });

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      console.error(
        "OpenAI Detaylı Hata:",
        JSON.stringify(errorData, null, 2),
      );

      const apiMessage =
        errorData &&
        typeof errorData === "object" &&
        "error" in errorData &&
        errorData.error &&
        typeof errorData.error === "object" &&
        "message" in errorData.error
          ? String((errorData.error as { message?: unknown }).message ?? "")
          : "";

      throw new Error(`AI Hatası: ${apiMessage || `HTTP ${response.status}`}`);
    }

    const parsed = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const rawContent = parsed.choices?.[0]?.message?.content ?? "";
    if (!rawContent.trim()) {
      return { error: "AI boş yanıt döndü." };
    }

    let json: Record<string, unknown>;
    try {
      json = parseJsonContent(rawContent);
    } catch {
      return { error: "AI yanıtı JSON formatında değil." };
    }

    const supplierName = String(json.supplierName ?? "").trim();
    const invoiceNumber = String(
      json.invoiceNumber ?? json.documentNumber ?? "",
    ).trim();

    const itemsRaw = json.items ?? json.lines;
    const lines = mapAiItems(itemsRaw);

    if (lines.length === 0) {
      return {
        error: "Faturadan ürün satırı çıkarılamadı.",
        supplierName,
        invoiceNumber,
      };
    }

    return {
      lines,
      supplierName,
      invoiceNumber,
      source: "openai",
    };
  } catch (error) {
    console.error("[parseInvoiceWithAiAction]", error);
    return {
      error:
        error instanceof Error
          ? error.message
          : "Fatura analizi sırasında bir hata oluştu.",
    };
  }
}
