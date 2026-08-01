import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ErpFactory } from "@/lib/services/erp/ErpFactory";

/**
 * Dahili API: Seçili ERP cari ekstre.
 * GET /api/bizimhesap/abstract?customerId=<SmartStokCustomerId>
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Oturum bulunamadı." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const customerId = searchParams.get("customerId")?.trim();

  if (!customerId) {
    return NextResponse.json(
      { error: "customerId zorunludur." },
      { status: 400 },
    );
  }

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { bizimHesapId: true, vknTckn: true },
  });

  if (!customer) {
    return NextResponse.json(
      { error: "Müşteri bulunamadı." },
      { status: 404 },
    );
  }

  const identifier =
    customer.bizimHesapId?.trim() || customer.vknTckn?.trim() || "";
  if (!identifier) {
    return NextResponse.json(
      {
        error:
          "Bu müşteri için cari kod (bizimHesapId) veya VKN tanımlı değil.",
      },
      { status: 400 },
    );
  }

  const erp = await ErpFactory.getInstance();
  const result = await erp.getCustomerAbstract(identifier);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json({ data: result.data });
}
