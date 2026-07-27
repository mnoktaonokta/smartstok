import { NextResponse } from "next/server";
import { compare, hash } from "bcryptjs";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const schema = z
  .object({
    currentPassword: z.string().min(1, "Mevcut şifre gerekli."),
    newPassword: z.string().min(8, "Yeni şifre en az 8 karakter olmalı."),
    confirmPassword: z.string().min(1, "Şifre tekrarı gerekli."),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Yeni şifreler eşleşmiyor.",
    path: ["confirmPassword"],
  });

/**
 * Server Action yerine Route Handler kullanıyoruz.
 * Auth cookie / 303 redirect, Server Action Flight yanıtını bozuyordu
 * ("An unexpected response was received from the server").
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Oturum bulunamadı." },
        { status: 401 },
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Geçersiz form." },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    });

    if (!user || !user.isActive) {
      return NextResponse.json(
        { error: "Kullanıcı bulunamadı." },
        { status: 404 },
      );
    }

    const isCurrentValid = await compare(
      parsed.data.currentPassword,
      user.hashedPassword,
    );

    if (!isCurrentValid) {
      return NextResponse.json(
        { error: "Mevcut şifre hatalı." },
        { status: 400 },
      );
    }

    const hashedPassword = await hash(parsed.data.newPassword, 12);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        hashedPassword,
        forcePasswordChange: false,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[POST /api/change-password]", error);
    return NextResponse.json(
      { error: "Şifre güncellenirken bir hata oluştu." },
      { status: 500 },
    );
  }
}
