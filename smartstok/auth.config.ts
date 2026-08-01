import type { NextAuthConfig } from "next-auth";
import type { UserRole } from "@/types/next-auth";
import { canAccessPath, getHomePath, hasRole } from "@/lib/roles";

/**
 * Edge / middleware uyumlu Auth.js yapılandırması.
 * Prisma ve bcrypt burada import edilmez.
 */
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  providers: [],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id!;
        token.roles = (user.roles ?? []) as UserRole[];
        token.forcePasswordChange = Boolean(user.forcePasswordChange);
        delete (token as { role?: unknown }).role;
      }

      const legacy = (token as { role?: UserRole }).role;
      if (
        (!Array.isArray(token.roles) || token.roles.length === 0) &&
        legacy
      ) {
        token.roles = [legacy];
        delete (token as { role?: unknown }).role;
      }

      if (!Array.isArray(token.roles)) {
        token.roles = [];
      }

      if (trigger === "update" && session) {
        if (typeof session.forcePasswordChange === "boolean") {
          token.forcePasswordChange = session.forcePasswordChange;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;

        const roles = Array.isArray(token.roles)
          ? (token.roles as UserRole[])
          : [];
        const legacy = (token as { role?: UserRole }).role;
        session.user.roles =
          roles.length > 0 ? roles : legacy ? [legacy] : [];

        session.user.forcePasswordChange = Boolean(token.forcePasswordChange);
      }

      return session;
    },
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const isLoggedIn = !!auth?.user;
      const isLoginPage = pathname.startsWith("/login");
      const isChangePasswordPage = pathname.startsWith("/change-password");
      const isMasterUnlock = pathname.startsWith("/master-unlock");
      const isAuthApi = pathname.startsWith("/api/auth");
      const isChangePasswordApi = pathname.startsWith("/api/change-password");
      const isUnauthorizedPage = pathname.startsWith("/dashboard/unauthorized");

      if (isAuthApi || isChangePasswordApi) {
        return true;
      }

      // Gizli lisans paneli — menüde yok; oturum zorunlu değil
      if (isMasterUnlock) {
        return true;
      }

      if (!isLoggedIn) {
        return isLoginPage;
      }

      const roles = (auth.user.roles ?? []) as UserRole[];
      const home = getHomePath(roles);

      if (auth.user.forcePasswordChange && !isChangePasswordPage) {
        return Response.redirect(new URL("/change-password", request.nextUrl));
      }

      if (!auth.user.forcePasswordChange && isChangePasswordPage) {
        return Response.redirect(new URL(home, request.nextUrl));
      }

      if (isLoginPage) {
        return Response.redirect(new URL(home, request.nextUrl));
      }

      if (isUnauthorizedPage) {
        return true;
      }

      if (pathname.startsWith("/dashboard") && !canAccessPath(roles, pathname)) {
        const url = new URL("/dashboard/unauthorized", request.nextUrl);
        url.searchParams.set("next", home);
        return Response.redirect(url);
      }

      // Admin paneli yalnızca ADMIN
      if (
        pathname.startsWith("/dashboard/admin") &&
        !hasRole(roles, "ADMIN")
      ) {
        const url = new URL("/dashboard/unauthorized", request.nextUrl);
        url.searchParams.set("next", home);
        return Response.redirect(url);
      }

      return true;
    },
  },
} satisfies NextAuthConfig;
