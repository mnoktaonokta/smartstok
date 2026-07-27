import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getCustomerAbstract } from "@/lib/services/bizimHesapService";

/**
 * Dahili API: Bizim Hesap cari ekstre.
 * GET /api/bizimhesap/abstract?customerId=<SmartStokCustomerId>
 *
 * Token yalnızca sunucuda okunur; istemciye gönderilmez.
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
    select: { bizimHesapId: true },
  });

  if (!customer) {
    return NextResponse.json(
      { error: "Müşteri bulunamadı." },
      { status: 404 },
    );
  }

  if (!customer.bizimHesapId?.trim()) {
    return NextResponse.json(
      {
        error:
          "Bu müşteri için Bizim Hesap cari kodu (bizimHesapId) tanımlı değil.",
      },
      { status: 400 },
    );
  }

  const result = await getCustomerAbstract(customer.bizimHesapId.trim());

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json({ data: result.data });
}
