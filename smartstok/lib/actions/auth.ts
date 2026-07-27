"use server";

import { AuthError } from "next-auth";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { signIn, signOut } from "@/auth";

const loginSchema = z.object({
  email: z.string().email("Geçerli bir e-posta girin."),
  password: z.string().min(1, "Şifre gerekli."),
});

export type AuthActionState = {
  error?: string;
  success?: boolean;
};

export async function loginAction(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Geçersiz giriş." };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email.toLowerCase(),
      password: parsed.data.password,
      redirectTo: "/dashboard",
    });

    return { success: true };
  } catch (error) {
    unstable_rethrow(error);

    if (error instanceof AuthError) {
      return { error: "E-posta veya şifre hatalı." };
    }

    console.error(error);
    return { error: "Giriş sırasında bir hata oluştu." };
  }
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}
