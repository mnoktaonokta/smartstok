import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { z } from "zod";
import { authConfig } from "@/auth.config";
import { prisma } from "@/lib/prisma";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  trustHost: true,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "E-posta", type: "email" },
        password: { label: "Şifre", type: "password" },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);

        if (!parsed.success) {
          console.log("Authorize: form doğrulama başarısız", parsed.error.flatten());
          return null;
        }

        const { email, password } = parsed.data;
        const normalizedEmail = email.toLowerCase();

        console.log("Authorize: aranan e-posta:", normalizedEmail);

        const user = await prisma.user.findUnique({
          where: { email: normalizedEmail },
        });

        console.log("Kullanıcı bulundu:", user
          ? {
              id: user.id,
              email: user.email,
              roles: user.roles,
              isActive: user.isActive,
              forcePasswordChange: user.forcePasswordChange,
              hashPrefix: user.hashedPassword?.slice(0, 10),
            }
          : null);

        if (!user || !user.isActive) {
          console.log("Authorize: kullanıcı yok veya pasif");
          return null;
        }

        const isPasswordValid = await compare(password, user.hashedPassword);
        console.log("Şifre eşleşti mi:", isPasswordValid);

        if (!isPasswordValid) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.fullName,
          roles: user.roles,
          forcePasswordChange: user.forcePasswordChange,
        };
      },
    }),
  ],
});
