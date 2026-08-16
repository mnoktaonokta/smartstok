import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

/**
 * Next.js 16: middleware → proxy.
 * Edge-uyumlu authConfig kullanılır (Prisma/bcrypt yok).
 */
export const proxy = NextAuth(authConfig).auth;

export const config = {
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
